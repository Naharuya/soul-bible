import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationService } from '../src/conversation_service.js';
import { createApp } from '../src/app.js';
import { createUsageLedger } from '../src/cost/usage_ledger.js';
import { responseSchema } from '../src/schema.js';
import { createOpenAiService } from '../src/openai_service.js';
import { costEnv, costBody, costFactory, costKnowledge } from './fixtures/cost_fixtures.js';

test('cost HTTP path preserves schema, auth and admin fields; quota ignores client plan and session rotation', async t => {
  const calls = []; const logs = [];
  const generate = createConversationService({ env: { ...costEnv, SOUL_FREE_DAILY_AI_CALLS: '1' },
    openAiFactory: costFactory(calls), logger: { info: (...args) => logs.push(args) } });
  const app = createApp({ generate, appToken: 'test-app', adminToken: 'test-admin', memberStore: { getAdminOverview: () => ({ total: 0, recent: [] }) } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (payload, token = 'test-app') => fetch(`${base}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  assert.equal((await post(costBody(), 'wrong')).status, 401);
  assert.equal((await post({ ...costBody(), plan: 'premium' })).status, 400);
  const payload = costBody(); payload.session.plan = 'premium'; payload.session.userId = 'forged';
  for (let i = 0; i < 3; i++) {
    payload.session.sessionId = `rotated-${i}`;
    const response = await post(payload); assert.equal(response.status, 200); responseSchema.parse(await response.json());
  }
  assert.equal(calls.length, 2);
  const crisis = await post(costBody('지금 당장 죽고 싶고 계획을 세웠어요'));
  assert.equal((await crisis.json()).stage, 'crisis'); assert.equal(calls.length, 2);
  assert.equal((await fetch(`${base}/v1/admin/overview`)).status, 401);
  const overview = await (await fetch(`${base}/v1/admin/overview`, { headers: { authorization: 'Bearer test-admin' } })).json();
  assert.ok(overview.service); assert.ok(overview.members); assert.ok(overview.metrics);
  assert.equal(overview.aiUsage.today.modelCalls, 2); assert.equal(overview.aiUsage.routing.local, 3);
  assert.doesNotMatch(JSON.stringify([...logs, generate.usageLedger.entries(), overview]), /test-only-cost-key|내일 발표|forged|rotated-/);
});
test('near quota uses one cheap call; trusted Premium gets higher quota', async () => {
  const calls = []; const service = createConversationService({ env: costEnv, openAiFactory: costFactory(calls), logger: {} });
  for (let i = 0; i < 6; i++) responseSchema.parse(await service(costBody()));
  assert.equal(calls.length, 9); // Four standard requests (2 each), one cheap, then local.
  assert.equal(calls.at(-1).model, 'mock-cheap');
  const before = calls.length;
  await service(costBody(), undefined, '', { userId: 'verified-member', plan: 'premium' });
  assert.equal(calls.length, before + 2);
});
test('sufficient RAG uses checked source text without any LLM even with no key or quota', async () => {
  const service = createConversationService({ env: { SOUL_FREE_DAILY_AI_CALLS: '0' },
    costKnowledgeProvider: costKnowledge, openAiFactory: () => assert.fail('no LLM'), logger: {} });
  const result = await service(costBody('위로하는 성경 구절 찾아주세요'));
  responseSchema.parse(result); assert.match(result.message, /합성 테스트 자료 1/);
  assert.equal(service.usageLedger.overview().routing.rag, 1);
  assert.equal(service.usageLedger.overview().today.aiRequests, 0);
});
test('RAG invalid sources and failure return local, never a fabricated reference or LLM', async () => {
  for (const search of [async () => { throw Error('private message'); }, async query => ({ ...(await costKnowledge.search(query)), tradition: 'buddhist' })]) {
    const service = createConversationService({ env: costEnv, costKnowledgeProvider: { search }, logger: {}, openAiFactory: () => assert.fail('no LLM') });
    const result = await service(costBody('위로하는 성경 구절 찾아주세요'));
    responseSchema.parse(result); assert.doesNotMatch(result.message, /합성 테스트|private message/);
    assert.equal(service.usageLedger.overview().routing.local, 1);
  }
});
test('cost storage errors and capacity fail to local while safety remains first', async () => {
  const service = createConversationService({ env: costEnv, usageLedger: { reserve() { throw Error('secret'); } },
    logger: {}, openAiFactory: () => assert.fail('no provider') });
  responseSchema.parse(await service(costBody()));
  assert.equal((await service(costBody('지금 당장 죽고 싶고 계획을 세웠어요'))).stage, 'crisis');
  const ledger = createUsageLedger({ maxOwners: 0 });
  const limited = createConversationService({ env: costEnv, usageLedger: ledger, logger: {}, openAiFactory: () => assert.fail('no provider') });
  responseSchema.parse(await limited(costBody()));
});
test('priced calls exceeding reservation are blocked before provider construction', async () => {
  const service = createConversationService({ env: { ...costEnv, SOUL_MODEL_PRICING_JSON: JSON.stringify({ 'mock-cheap': { input: 100, cachedInput: 10, output: 100 } }) },
    logger: {}, openAiFactory: () => assert.fail('budget must block') });
  responseSchema.parse(await service(costBody()));
  assert.equal(service.usageLedger.overview().today.modelCalls, 0);
});
test('cached token details leave the OpenAI adapter as numbers only', async () => {
  let usage;
  const schema = { parse: value => value };
  const provider = createOpenAiService({ apiKey: 'test-only', model: 'mock', client: { responses: { create: async () => ({
    output_text: '{}', usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40, secret: 'private' }, output_tokens: 10 },
  }) } } });
  await provider.runStructured({ name: 'mock', input: {}, schema, jsonSchema: {} }, { onUsage: counts => { usage = counts; } });
  assert.deepEqual(usage, { inputTokens: 100, cachedInputTokens: 40, outputTokens: 10 });
});

test('premium model is used only for a complex trusted request after enough non-premium calls', async () => {
  const calls = []; const service = createConversationService({ env: costEnv, openAiFactory: costFactory(calls), logger: {} });
  for (let i = 0; i < 19; i++) await service(costBody(), undefined, '', { userId: `verified-${i}`, plan: 'premium' });
  const complex = costBody('신정론의 교리와 모순을 비교하고 싶어요. '.repeat(10));
  await service(complex, undefined, '', { userId: 'verified-complex', plan: 'premium' });
  assert.equal(calls.at(-1).model, 'mock-premium');
  assert.ok(calls.filter(call => call.model === 'mock-premium').length / calls.length <= 0.05);
});

test('unknown model prices do not fail service and remain visibly unknown', async () => {
  const service = createConversationService({ env: { ...costEnv, SOUL_MODEL_PRICING_JSON: '{}' }, openAiFactory: costFactory(), logger: {} });
  responseSchema.parse(await service(costBody()));
  assert.equal(service.usageLedger.overview().today.estimatedCostUsd, null);
  assert.equal(service.usageLedger.overview().today.modelCalls, 2);
});

test('simultaneous HTTP-independent generations cannot bypass request reservations', async () => {
  const calls = []; const service = createConversationService({ env: costEnv, openAiFactory: costFactory(calls), logger: {} });
  const responses = await Promise.all(Array.from({ length: 12 }, () => service(costBody())));
  responses.forEach(response => responseSchema.parse(response));
  assert.equal(service.usageLedger.overview().today.aiRequests, 5);
  assert.equal(calls.length, 9);
});
