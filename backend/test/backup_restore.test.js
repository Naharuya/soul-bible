import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createMemberStore } from '../src/member_store.js';
import { createSqliteUsageLedger } from '../src/cost/sqlite_usage_ledger.js';

async function workspace(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'onaria-restore-fixture-'));
  const handles = [];
  t.after(async () => {
    for (const handle of handles.reverse()) handle.close();
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('onaria-restore-fixture-'));
    await rm(root, { recursive: true, force: true });
  });
  return { root, own(handle) { handles.push(handle); return handle; } };
}

test('member SQLite backup restores a consistent snapshot without replacing newer source data', async t => {
  const work = await workspace(t);
  const source = path.join(work.root, 'members.sqlite');
  const restoredFile = path.join(work.root, 'members-restored.sqlite');
  const store = work.own(createMemberStore({ filename: source }));
  const first = { name: 'Fixture One', phone: '01000000001', churchName: 'Fixture', loginProvider: 'phone' };
  store.create(first);
  const reader = work.own(new Database(source, { readonly: true, fileMustExist: true }));
  await reader.backup(restoredFile);
  store.create({ ...first, name: 'Fixture Two', phone: '01000000002' });
  const restored = work.own(new Database(restoredFile, { readonly: true, fileMustExist: true }));
  assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM members').get().n, 1);
  assert.equal(reader.prepare('SELECT COUNT(*) AS n FROM members').get().n, 2);
  const reopened = work.own(createMemberStore({ filename: restoredFile }));
  assert.equal(reopened.getAdminOverview().total, 1);
  assert.throws(() => reopened.create(first), error => error.code === 'PHONE_EXISTS');
});

test('cost SQLite restore preserves known cost, unknown usage and owner quota identity', async t => {
  const work = await workspace(t);
  const filename = path.join(work.root, 'usage.sqlite');
  const restoredFile = path.join(work.root, 'usage-restored.sqlite');
  const now = () => new Date('2026-09-14T00:00:00Z');
  const pricing = { mock: { input: 2, cachedInput: 0.5, output: 8 } };
  const original = work.own(createSqliteUsageLedger({ filename, env: {}, pricing, now }));
  const identity = { userId: 'fixture-private-member', sessionId: 'fixture-private-session' };
  const lease = original.reserve(identity);
  lease.recordCall({ model: 'mock', modelTier: 'cheap' })({ inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 });
  lease.finish({ tier: lease.decision.tier, provider: 'openai' });
  assert.equal(original.overview().today.estimatedCostUsd, 0.0022);
  const unknown = original.reserve(identity);
  unknown.recordCall({ model: 'mock', modelTier: 'cheap' });
  unknown.finish({ tier: unknown.decision.tier, provider: 'openai' });
  const before = original.overview();
  assert.equal(before.today.estimatedCostUsd, null);
  const entries = original.entries();
  const reader = work.own(new Database(filename, { readonly: true, fileMustExist: true }));
  await reader.backup(restoredFile);
  const verify = work.own(new Database(restoredFile, { readonly: true, fileMustExist: true }));
  assert.equal(verify.pragma('integrity_check', { simple: true }), 'ok');
  const restored = work.own(createSqliteUsageLedger({ filename: restoredFile, env: {}, pricing, now }));
  assert.deepEqual(restored.overview(), before);
  assert.deepEqual(restored.entries(), entries);
  assert.doesNotMatch(JSON.stringify(restored.entries()), /fixture-private/);
});
