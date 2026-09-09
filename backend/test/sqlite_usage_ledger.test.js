import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { createSqliteUsageLedger } from '../src/cost/sqlite_usage_ledger.js';
import { createRuntimeUsageLedger } from '../src/cost/runtime_ledger.js';
import { createConversationService } from '../src/conversation_service.js';
import { responseSchema } from '../src/schema.js';
import { costEnv, costBody, costFactory } from './fixtures/cost_fixtures.js';

const initialTime = '2026-09-09T12:00:00.000Z';
const prices = { mock: { input: 2, cachedInput: 0.5, output: 8 } };
async function workspace(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'soul-cost-ledger-'));
  const filename = path.join(directory, 'usage.sqlite');
  const ledgers = [];
  t.after(async () => {
    for (const ledger of ledgers) ledger.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('soul-cost-ledger-'));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, filename, open(options = {}) {
    const ledger = createSqliteUsageLedger({ filename, now: () => new Date(initialTime), ...options }); ledgers.push(ledger); return ledger;
  } };
}
function paidCall(ledger, input = {}, counts = null) {
  const lease = ledger.reserve(input);
  assert.ok(['cheap', 'standard', 'premium'].includes(lease.decision.tier));
  const track = lease.recordCall({ model: 'mock', modelTier: 'cheap' });
  if (counts) track(counts);
  lease.finish({ tier: lease.decision.tier, provider: 'openai' });
  return { lease, track };
}

test('SQLite restart preserves quota, salted identities, tokens and cached cost', async t => {
  const store = await workspace(t); let ledger = store.open({ pricing: prices });
  paidCall(ledger, { userId: 'private-member', sessionId: 'private-session' }, { inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 });
  const before = ledger.entries()[0]; ledger.close();
  ledger = store.open({ pricing: prices });
  assert.equal(ledger.overview().scope, 'sqlite'); assert.equal(ledger.overview().persistent, true);
  assert.equal(ledger.overview().today.estimatedCostUsd, 0.0022);
  assert.equal(ledger.overview().today.aiRequests, 1); assert.equal(ledger.overview().cacheHitRate, 0.4);
  paidCall(ledger, { userId: 'private-member', sessionId: 'private-session' });
  const after = ledger.entries().find(entry => entry.estimatedCostUsd === null);
  assert.equal(after.userId, before.userId); assert.equal(after.sessionId, before.sessionId);
  assert.equal(ledger.overview().today.estimatedCostUsd, null);
  assert.doesNotMatch(JSON.stringify(ledger.entries()), /private-member|private-session/);
});

test('SQLite quota cannot be reset by closing the process connection or rotating anonymous session IDs', async t => {
  const store = await workspace(t);
  for (let i = 0; i < 5; i++) { const ledger = store.open(); paidCall(ledger, { sessionId: `rotating-${i}`, plan: 'premium' }); ledger.close(); }
  const ledger = store.open();
  assert.equal(ledger.reserve({ sessionId: 'new-session', plan: 'premium' }).decision.tier, 'local');
  assert.equal(ledger.overview().today.aiRequests, 5);
  assert.ok(Math.abs(ledger.overview().today.budgetUsedUsd - 0.03) < 1e-12);
});

test('expired unstarted reservation is released, but orphaned provider calls retain their budget', async t => {
  const store = await workspace(t); let clock = new Date(initialTime);
  const ledger = store.open({ now: () => clock });
  const untouched = ledger.reserve();
  const started = ledger.reserve(); started.recordCall({ model: 'mock', modelTier: 'cheap' });
  clock = new Date(clock.getTime() + 61_000);
  const recovered = ledger.overview();
  assert.equal(recovered.today.aiRequests, 1); assert.equal(recovered.today.budgetUsedUsd, 0.006);
  assert.equal(recovered.today.recoveredReservations, 2); assert.equal(recovered.today.pendingReservations, 0);
  assert.throws(() => untouched.recordCall({ model: 'mock', modelTier: 'cheap' }));
  untouched.finish(); started.finish();
  assert.equal(ledger.overview().routing.local, 2);
});

test('live reservations survive opening another connection and cannot be recovered prematurely', async t => {
  const store = await workspace(t); const a = store.open(); a.reserve();
  const b = store.open();
  assert.equal(b.overview().today.pendingReservations, 1);
  assert.equal(b.overview().today.budgetUsedUsd, 0.006);
});

test('late usage is idempotent and settles expired budget using the call-time price snapshot', async t => {
  const store = await workspace(t); let clock = new Date(initialTime);
  const pricing = structuredClone(prices); const ledger = store.open({ now: () => clock, pricing });
  const lease = ledger.reserve(); const track = lease.recordCall({ model: 'mock', modelTier: 'cheap' });
  pricing.mock.input = 999;
  clock = new Date(clock.getTime() + 61_000); ledger.overview();
  track({ inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 });
  track({ inputTokens: 999999, outputTokens: 999999 }); lease.finish();
  assert.equal(ledger.overview().today.budgetUsedUsd, 0.0022);
  assert.equal(ledger.overview().today.estimatedCostUsd, 0.0022);
  assert.equal(ledger.overview().today.inputTokens, 1000);
  assert.equal(ledger.overview().routing.local, 1);
});

test('month/day boundaries and record pruning do not delete current-month quota', async t => {
  const store = await workspace(t); let clock = new Date('2026-09-01T00:00:00Z');
  const ledger = store.open({ now: () => clock, retentionDays: 32, env: { SOUL_FREE_MONTHLY_AI_CALLS: '1' } });
  paidCall(ledger);
  clock = new Date('2026-09-30T23:59:00Z');
  assert.equal(ledger.reserve().decision.tier, 'local');
  clock = new Date('2026-10-01T00:00:00Z');
  paidCall(ledger);
  clock = new Date('2026-11-05T00:00:00Z'); ledger.overview();
  assert.equal(ledger.entries().length, 0);
  assert.equal(ledger.reserve().decision.tier, 'standard');
});

test('premium call share is checked atomically rather than trusting a stale advisory read', async t => {
  const store = await workspace(t); const first = store.open(); const second = store.open();
  for (let i = 0; i < 38; i++) {
    const lease = first.reserve({ userId: `seed-${i}`, plan: 'premium' });
    if (i < 19) { lease.recordCall({ model: 'mock', modelTier: 'cheap' }); lease.finish(); }
  }
  const a = first.reserve({ userId: 'premium-a', plan: 'premium', taskType: 'complex' });
  const b = second.reserve({ userId: 'premium-b', plan: 'premium', taskType: 'complex' });
  assert.equal(a.decision.tier, 'premium'); assert.equal(b.decision.tier, 'premium');
  assert.equal(a.capModelTier('premium'), 'premium'); assert.equal(b.capModelTier('premium'), 'premium');
  a.recordCall({ model: 'mock', modelTier: 'premium' });
  assert.throws(() => b.recordCall({ model: 'mock', modelTier: 'premium' }), { code: 'COST_PREMIUM_SHARE' });
  b.recordCall({ model: 'mock', modelTier: 'standard' });
  assert.equal(first.overview().today.premiumModelCalls, 1);
});

test('foreign databases and corruption do not turn into a fresh permissive ledger', async t => {
  const store = await workspace(t); const foreign = new Database(store.filename);
  foreign.exec('CREATE TABLE members (id INTEGER)'); foreign.close();
  assert.throws(() => store.open());
  const inspect = new Database(store.filename);
  assert.equal(inspect.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'cost_requests'").get().n, 0); inspect.close();
  const corrupted = path.join(store.directory, 'corrupt.sqlite'); await writeFile(corrupted, 'private broken file');
  const logs = [];
  const ledger = createRuntimeUsageLedger({ env: { SOUL_USAGE_DB_PATH: corrupted }, logger: { error: value => logs.push(value) } });
  assert.equal(ledger.overview().available, false); assert.throws(() => ledger.reserve());
  assert.deepEqual(logs, ['cost_ledger_unavailable']);
  const service = createConversationService({ env: costEnv, usageLedger: ledger, logger: {}, openAiFactory: () => assert.fail('no provider') });
  responseSchema.parse(await service(costBody()));
  assert.equal((await service(costBody('지금 당장 죽고 싶고 계획을 세웠어요'))).stage, 'crisis');
});

test('write-lock timeout prevents a model call while keeping local responses available', async t => {
  const store = await workspace(t); const ledger = store.open({ timeoutMs: 10 });
  const locker = new Database(store.filename); locker.exec('BEGIN IMMEDIATE');
  t.after(() => { if (locker.open) { locker.exec('ROLLBACK'); locker.close(); } });
  const service = createConversationService({ env: costEnv, usageLedger: ledger, logger: {}, openAiFactory: () => assert.fail('no provider') });
  responseSchema.parse(await service(costBody()));
  locker.exec('ROLLBACK'); locker.close();
  assert.equal(ledger.overview().today.modelCalls, 0);
});

test('only allowlisted metadata reaches SQLite, including its WAL file', async t => {
  const store = await workspace(t); const ledger = store.open();
  const lease = ledger.reserve({ userId: 'PRIVATE_ID_SENTINEL', sessionId: 'PRIVATE_SESSION_SENTINEL',
    prompt: 'PRIVATE_PROMPT_SENTINEL', memory: 'PRIVATE_MEMORY_SENTINEL', apiKey: 'PRIVATE_KEY_SENTINEL' });
  lease.recordCall({ model: 'mock', modelTier: 'cheap', prompt: 'PRIVATE_PROMPT_SENTINEL' })({ inputTokens: 100, outputTokens: 10, prompt: 'PRIVATE_PROMPT_SENTINEL' });
  lease.finish();
  for (const filename of [store.filename, `${store.filename}-wal`]) {
    const content = await readFile(filename);
    for (const sentinel of ['PRIVATE_ID_SENTINEL', 'PRIVATE_SESSION_SENTINEL', 'PRIVATE_PROMPT_SENTINEL', 'PRIVATE_MEMORY_SENTINEL', 'PRIVATE_KEY_SENTINEL']) assert.equal(content.includes(Buffer.from(sentinel)), false);
  }
});

test('runtime persistent ledger works across real conversation service restarts', async t => {
  const store = await workspace(t); const calls = [];
  const env = { ...costEnv, SOUL_USAGE_DB_PATH: store.filename, SOUL_FREE_DAILY_AI_CALLS: '1' };
  for (let i = 0; i < 2; i++) {
    const ledger = createRuntimeUsageLedger({ env, logger: {} });
    try {
      const service = createConversationService({ env, usageLedger: ledger, openAiFactory: costFactory(calls), logger: {} });
      responseSchema.parse(await service(costBody()));
    } finally { ledger.close(); }
  }
  assert.equal(calls.length, 2);
});

test('service atomically losing a premium slot downgrades and reports the actual standard route', async t => {
  const store = await workspace(t); const ledger = store.open({ env: costEnv });
  for (let i = 0; i < 58; i++) {
    const lease = ledger.reserve({ userId: `seed-${i}`, plan: 'premium' });
    if (i < 19) { lease.recordCall({ model: 'mock', modelTier: 'cheap' }); lease.finish(); }
  }
  const competitor = ledger.reserve({ userId: 'competitor', plan: 'premium', taskType: 'complex' });
  const wrapper = { ...ledger, reserve(input) {
    const lease = ledger.reserve(input);
    return { ...lease, recordCall(options) {
      if (options.modelTier === 'premium') competitor.recordCall({ model: 'mock', modelTier: 'premium' });
      return lease.recordCall(options);
    } };
  } };
  const calls = [];
  const service = createConversationService({ env: costEnv, usageLedger: wrapper, openAiFactory: costFactory(calls), logger: {} });
  responseSchema.parse(await service(costBody('신정론의 교리와 모순을 비교하고 싶어요. '.repeat(10)), undefined, '', { userId: 'member', plan: 'premium' }));
  assert.deepEqual(calls.map(call => call.model), ['mock-cheap', 'mock-standard']);
  assert.equal(ledger.overview().routing.premium, 0);
  assert.equal(ledger.overview().routing.standard, 20);
});

const moduleUrl = new URL('../src/cost/sqlite_usage_ledger.js', import.meta.url).href;
const workerCode = `
import { createSqliteUsageLedger } from ${JSON.stringify(moduleUrl)};
const ledger = createSqliteUsageLedger({ filename: process.argv[1], timeoutMs: 5000, now: () => new Date(${JSON.stringify(initialTime)}) });
process.send({ ready: true });
process.once('message', () => {
  const lease = ledger.reserve();
  const paid = ['cheap','standard','premium'].includes(lease.decision.tier);
  if (paid) lease.recordCall({ model: 'mock', modelTier: 'cheap' });
  if (process.argv[2] === 'crash') { process.send({ reserved: true }); setInterval(() => {}, 1000); return; }
  lease.finish({ tier: paid ? 'cheap' : 'local' });
  ledger.close(); process.send({ paid }); process.disconnect();
});
`;
function worker(t, filename, mode = 'normal') {
  const child = spawn(process.execPath, ['--input-type=module', '-e', workerCode, filename, mode], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  const messages = []; let stderr = '';
  child.stderr.on('data', data => { stderr += data; }); child.on('message', message => messages.push(message));
  const ready = new Promise((resolve, reject) => {
    child.once('message', resolve); child.once('error', reject); child.once('exit', code => { if (!messages.length) reject(new Error(`Worker initialization failed (${code}): ${stderr}`)); });
  });
  const done = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal, messages, stderr })));
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  return { child, ready, done, messages };
}

test('independent Node processes share one atomic quota with no overspend', { timeout: 30000 }, async t => {
  const store = await workspace(t); store.open().close();
  const workers = Array.from({ length: 8 }, () => worker(t, store.filename));
  await Promise.all(workers.map(item => item.ready)); workers.forEach(item => item.child.send('start'));
  const results = await Promise.all(workers.map(item => item.done));
  results.forEach(result => assert.equal(result.code, 0, result.stderr));
  assert.equal(results.filter(result => result.messages.some(message => message.paid)).length, 5);
  const ledger = store.open(); assert.equal(ledger.overview().today.aiRequests, 5);
  assert.ok(Math.abs(ledger.overview().today.budgetUsedUsd - 0.03) < 1e-12);
});

test('a killed process leaves a durable call reservation which recovery does not refund', { timeout: 15000 }, async t => {
  const store = await workspace(t); store.open().close();
  const item = worker(t, store.filename, 'crash'); await item.ready;
  const reserved = new Promise(resolve => item.child.once('message', resolve)); item.child.send('start'); await reserved;
  item.child.kill('SIGKILL'); await item.done;
  const ledger = store.open({ now: () => new Date(Date.parse(initialTime) + 61_000) });
  assert.equal(ledger.overview().today.modelCalls, 1);
  assert.equal(ledger.overview().today.budgetUsedUsd, 0.006);
  assert.equal(ledger.overview().today.recoveredReservations, 1);
});
