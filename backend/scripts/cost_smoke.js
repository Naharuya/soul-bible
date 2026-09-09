// Deterministic HTTP smoke. No dotenv, real credentials, member DB or paid API.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { createConversationService } from '../src/conversation_service.js';
import { responseSchema } from '../src/schema.js';
import { costEnv, costBody, costFactory, costKnowledge } from '../test/fixtures/cost_fixtures.js';

const calls = [];
const tests = spawnSync(process.execPath, ['--test'], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8' });
if (tests.status !== 0) throw new Error('Backend regression suite failed. Run npm test for details.');
const generate = createConversationService({ env: costEnv, logger: {}, openAiFactory: costFactory(calls), costKnowledgeProvider: costKnowledge });
const app = createApp({ generate, adminToken: 'mock-admin', memberStore: { getAdminOverview: () => ({ total: 0, recent: [] }) } });
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const messages = ['안녕하세요', '위로하는 성경 구절 찾아주세요', ...Array(6).fill('내일 발표가 걱정돼요'), '지금 당장 죽고 싶고 계획을 세웠어요'];
  for (const message of messages) {
    const response = await fetch(`${base}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(costBody(message)) });
    assert.equal(response.status, 200); responseSchema.parse(await response.json());
  }
  const response = await fetch(`${base}/v1/admin/overview`, { headers: { authorization: 'Bearer mock-admin' } });
  assert.equal(response.status, 200);
  const { aiUsage } = await response.json();
  assert.equal(aiUsage.today.modelCalls, 9); assert.equal(aiUsage.routing.rag, 1);
  assert.equal(aiUsage.routing.cheap, 1); assert.equal(aiUsage.routing.local, 3);
  assert.equal(aiUsage.today.inputTokens, 9000); assert.equal(aiUsage.today.cachedInputTokens, 3600);
  const report = { ok: true, costGate: true, modelRouter: true, usageLedger: true, pricing: true, adminMetrics: true, existingTestsPassed: true };
  console.log(JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mock: true, totalRequests: messages.length, llmCalls: calls.length,
    localRagResponses: aiUsage.routing.local + aiUsage.routing.rag,
    cheapCalls: calls.filter(call => call.model === 'mock-cheap').length,
    standardCalls: calls.filter(call => call.model === 'mock-standard').length,
    premiumCalls: calls.filter(call => call.model === 'mock-premium').length,
    inputTokens: aiUsage.today.inputTokens, cachedInputTokens: aiUsage.today.cachedInputTokens, outputTokens: aiUsage.today.outputTokens,
    estimatedCostUsd: aiUsage.today.estimatedCostUsd, averageCostPerAiSession: aiUsage.averageCostPerAiSession }, null, 2));
} finally { await new Promise(resolve => server.close(resolve)); }
