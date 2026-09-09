// Real localhost HTTP + real temporary SQLite. No production data or paid API.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRuntimeUsageLedger } from '../src/cost/runtime_ledger.js';
import { createConversationService } from '../src/conversation_service.js';
import { createApp } from '../src/app.js';
import { responseSchema } from '../src/schema.js';
import { costEnv, costBody, costFactory } from '../test/fixtures/cost_fixtures.js';

const directory = await mkdtemp(path.join(tmpdir(), 'soul-cost-smoke-'));
const calls = [];
const env = { ...costEnv, SOUL_USAGE_DB_PATH: path.join(directory, 'usage.sqlite'), SOUL_FREE_DAILY_AI_CALLS: '1' };
async function start() {
  const ledger = createRuntimeUsageLedger({ env, logger: {} });
  assert.equal(ledger.overview().persistent, true);
  const generate = createConversationService({ env, usageLedger: ledger, openAiFactory: costFactory(calls), logger: {} });
  const app = createApp({ generate, adminToken: 'mock-admin', memberStore: { getAdminOverview: () => ({ total: 0, recent: [] }) } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ledger,
    async chat(message) {
      const response = await fetch(`${base}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(costBody(message)) });
      assert.equal(response.status, 200); return responseSchema.parse(await response.json());
    },
    async overview() {
      const response = await fetch(`${base}/v1/admin/overview`, { headers: { authorization: 'Bearer mock-admin' } });
      assert.equal(response.status, 200); return (await response.json()).aiUsage;
    },
    async close() { await new Promise(resolve => server.close(resolve)); ledger.close(); },
  };
}
let running;
try {
  running = await start(); await running.chat(); assert.equal(calls.length, 2);
  const before = await running.overview(); await running.close(); running = null;
  running = await start(); await running.chat(); assert.equal(calls.length, 2);
  const after = await running.overview();
  assert.equal(after.today.aiRequests, 1); assert.equal(after.today.modelCalls, before.today.modelCalls);
  assert.equal(after.today.estimatedCostUsd, before.today.estimatedCostUsd);
  assert.equal((await running.chat('지금 당장 죽고 싶고 계획을 세웠어요')).stage, 'crisis');
  running.ledger.close();
  await running.chat(); assert.equal(calls.length, 2);
  assert.equal((await running.overview()).available, false);
  assert.equal((await running.chat('지금 당장 죽고 싶고 계획을 세웠어요')).stage, 'crisis');
  console.log(JSON.stringify({ ok: true, persistentLedger: true, restartQuota: true,
    adminMetricsPersisted: true, storageFailureLocalFallback: true, safetyBypass: true,
    mock: true, llmCallsBeforeRestart: 2, additionalLlmCallsAfterRestart: 0,
    persistedInputTokens: after.today.inputTokens, persistedCachedInputTokens: after.today.cachedInputTokens,
    persistedOutputTokens: after.today.outputTokens, estimatedCostUsd: after.today.estimatedCostUsd }, null, 2));
} finally {
  if (running) await running.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('soul-cost-smoke-'));
  await rm(directory, { recursive: true, force: true });
}
