import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConversationService } from '../src/conversation_service.js';
import { createOpenAiService } from '../src/openai_service.js';
import { routeCostRequest, applySessionTarget } from '../src/cost/model_router.js';
import { compactModelInput } from '../src/cost/prompt_context.js';
import { readPricing, estimateCost } from '../src/cost/model_pricing.js';
import { createUsageLedger } from '../src/cost/usage_ledger.js';
import { createSqliteUsageLedger } from '../src/cost/sqlite_usage_ledger.js';
import { responseSchema } from '../src/schema.js';
import { createApp } from '../src/app.js';
import { costBody, costKnowledge } from './fixtures/cost_fixtures.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

const env = { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only-cost-v1' };
const counts = { inputTokens: 800, cachedInputTokens: 400, cacheWriteTokens: 200, outputTokens: 120 };
const support = () => ({ emotion: '불안', empathy: '불안한 마음이 드셨군요. 천천히 이야기해 주세요.',
  nextQuestion: '지금 가장 마음에 남는 것은 무엇인가요?', summary: '불안한 감정과 안정에 대한 필요' });
function setup(extra = {}) {
  const calls = [], logs = [];
  const service = createConversationService({ env, knowledgeProvider: costKnowledge, costKnowledgeProvider: costKnowledge,
    logger: { info: (event, data) => logs.push({ event, ...data }) },
    openAiFactory: ({ model, timeout }) => ({ runStructured: async (task, options) => {
      calls.push({ model, task, timeout });
      options.onUsage(counts);
      return task.name === 'support_turn_v1' ? support() : task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput();
    } }), ...extra });
  return { service, calls, logs };
}

for (const message of ['오늘 피곤해요', '마음이 좀 답답해요', '불안해요', '위로해 주세요']) {
  test(`simple support uses at most one Luna call: ${message}`, async () => {
    const { service, calls, logs } = setup();
    const result = await service(costBody(message));
    responseSchema.parse(result);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'gpt-5.6-luna');
    assert.equal(calls[0].task.maxOutputTokens, 220);
    assert.equal(calls[0].timeout, 6000);
    assert.equal(logs.at(-1).fallback, false);
    assert.equal(logs.at(-1).tier, 'luna');
    assert.equal(result.message, support().empathy);
    assert.equal(result.question, support().nextQuestion);
    assert.doesNotMatch(JSON.stringify(logs), /test-only-cost-v1|오늘 피곤|불안한 감정/);
  });
}

test('single compact Terra call handles complex nonreligious support', async () => {
  const { service, calls, logs } = setup();
  responseSchema.parse(await service(costBody('가족과 갈등이 있고 직장에서도 반복되는 관계 문제가 있어요. 하지만 둘 다 포기하기 어려워요.')));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'gpt-5.6-terra');
  assert.equal(calls[0].task.maxOutputTokens, 360);
  assert.equal(logs.at(-1).fallback, false);
});

test('RAG and crisis bypass all models', async () => {
  for (const text of ['위로하는 성경 구절 찾아주세요', '시편 23:1 알려줘', '지금 당장 죽고 싶고 계획을 세웠어요']) {
    const { service, calls, logs } = setup();
    const result = await service(costBody(text));
    assert.equal(calls.length, 0);
    assert.equal(logs.at(-1).estimatedCostUsd, 0);
    if (text.includes('죽고')) assert.equal(result.stage, 'crisis');
    else {
      assert.equal(logs.at(-1).provider, 'rag');
      assert.equal(logs.at(-1).tier, 'rag');
    }
  }
});

test('simple faith reuses specialist and checked sources with one Luna call', async () => {
  const { service, calls, logs } = setup();
  await service(costBody('기도하며 마음을 돌아보고 싶어요'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].task.name, 'religion_protestant');
  assert.equal(calls[0].model, 'gpt-5.6-luna');
  assert.ok(calls[0].task.input.sourceContext.length);
  assert.equal(logs.at(-1).fallback, false);
});

test('Sol requires complex reasoning, trusted premium and existing global allowance', async () => {
  const { service, calls, logs } = setup();
  for (let i = 0; i < 20; i++) await service(costBody('불안해요'), undefined, '', { userId: `member-${i}`, plan: 'premium' });
  await service(costBody('신정론과 자유의지의 모순을 논증해 주세요'), undefined, '', { userId: 'theology-member', plan: 'premium' });
  assert.equal(calls.at(-1).model, 'gpt-5.6-sol');
  assert.equal(calls.at(-1).task.maxOutputTokens, 600);
  assert.equal(calls.at(-1).timeout, 12000);
  assert.equal(logs.at(-1).fallback, false);
  assert.equal(logs.at(-1).targetAction, 'quality_floor_retained');
  const before = calls.length;
  await service(costBody('신정론의 모순을 설명해 주세요'));
  assert.ok(calls.slice(before).every(call => call.model !== 'gpt-5.6-sol'));
});

test('quality floor prevents budget-forced weak answers; feedback escalates next request', async () => {
  const high = routeCostRequest(costBody('신정론을 설명해 주세요'));
  assert.equal(high.tier, 'sol');
  assert.equal(applySessionTarget(high, { sessionBudgetUsedUsd: 1 }).tier, 'sol');
  const general = routeCostRequest(costBody('두 가지 선택의 장단점을 비교하고 싶어요'));
  assert.equal(applySessionTarget(general, { sessionBudgetUsedUsd: 1 }).tier, 'terra');
  assert.equal(routeCostRequest(costBody('답변이 너무 일반적이고 부족해요')).reason, 'escalation_quality');
  const { service, calls, logs } = setup({ env: { ...env, SOUL_FREE_DAILY_AI_BUDGET_USD: '0.0001' } });
  responseSchema.parse(await service(costBody('복합적인 갈등을 상담하고 싶어요')));
  assert.equal(calls.length, 0);
  assert.equal(logs.at(-1).provider, 'local');
});

for (const failure of ['schema', 'provider', 'integrity', 'quality']) {
  test(`${failure} preserves local fallback without retrying a simple turn`, async () => {
    let calls = 0;
    const { service, logs } = setup({ openAiFactory: () => ({ runStructured: async () => {
      calls++;
      if (failure === 'provider') throw Object.assign(Error('private-provider-message'), { status: 401 });
      if (failure === 'schema') return {};
      if (failure === 'integrity') return { ...support(), empathy: '우울증 진단입니다. 치료를 중단하세요.' };
      return { ...support(), empathy: '네' };
    } }) });
    responseSchema.parse(await service(costBody('불안해요')));
    assert.equal(calls, 1);
    assert.equal(logs.at(-1).fallback, true);
    assert.equal(logs.at(-1).estimatedCostUsd, null);
    assert.doesNotMatch(JSON.stringify(logs), /private-provider-message/);
  });
}

test('summary and last pair replace duplicated history; current message remains intact', () => {
  const compact = compactModelInput({ sessionId: 'private-id', userMessage: 'current', memorySummary: 'm'.repeat(4000),
    conversationState: { conversationMemory: 'old'.repeat(1000), previousUserAnswer: 'u'.repeat(2000),
      previousAssistantQuestion: 'q'.repeat(2000), turnCount: 2, arbitraryHistory: ['not allowed'] } });
  assert.equal(compact.memorySummary.length, 800);
  assert.equal(compact.recentTurns.length, 2);
  assert.equal(compact.userMessage, 'current');
  assert.equal(compact.sessionId, undefined);
  assert.equal(compact.conversationState.conversationMemory, undefined);
  assert.equal(compact.conversationState.arbitraryHistory, undefined);
});

test('successful response with absent usage stays unknown, not free', async () => {
  const { service, logs } = setup({ openAiFactory: () => ({ runStructured: async () => support() }) });
  const result = await service(costBody('오늘 피곤해요'));
  assert.equal(result.message, support().empathy);
  assert.equal(logs.at(-1).fallback, false);
  assert.equal(logs.at(-1).estimatedCostUsd, null);
  assert.equal(logs.at(-1).session.sessionEstimatedCostUsd, null);
});

test('V1 HTTP contract and member authentication remain unchanged', async t => {
  const { service, calls } = setup();
  const server = createApp({ generate: service, appToken: 'test-app', memberStore: {} }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/v1/mind/chat`;
  const headers = { 'content-type': 'application/json', authorization: 'Bearer test-app' };
  assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(costBody()) })).status, 401);
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(costBody('오늘 피곤해요')) });
  assert.equal(response.status, 200);
  const output = responseSchema.parse(await response.json());
  assert.equal(output.detectedEmotion, '불안');
  assert.equal(calls.length, 1);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...costBody(), plan: 'premium' }) })).status, 400);
});

test('V1 preserves seven religion boundaries and citation rejection', async () => {
  const labels = { protestant: '기독교', catholic: '가톨릭', buddhist: '불교', jewish: '토라', islamic: '이슬람', hindu: '힌두교', confucian: '유교' };
  for (const [religion, label] of Object.entries(labels)) {
    const provider = { async search(query) {
      const found = await costKnowledge.search(query);
      found.results = found.results.map(source => ({ ...source, tradition: religion, sourceId: `${religion}:fixture:1` }));
      found.diagnostics.scores = found.diagnostics.scores.map(score => ({ ...score, sourceId: `${religion}:fixture:1` }));
      return found;
    } };
    const { service, calls, logs } = setup({ knowledgeProvider: provider });
    responseSchema.parse(await service({ ...costBody(`${label} 신앙으로 마음을 돌아보고 싶어요`), religion }));
    assert.equal(calls.length, 1, `${religion}: ${logs.at(-1)?.fallbackReason}`);
    assert.equal(calls[0].task.name, `religion_${religion}`);
    assert.equal(logs.at(-1).fallback, false, religion);
  }
  const { service, logs } = setup({ openAiFactory: () => ({ runStructured: async () => religionOutput({ sourceRefs: ['invented'] }) }) });
  await service(costBody('기도하며 마음을 돌아보고 싶어요'));
  assert.equal(logs.at(-1).fallback, true);
});

test('fixed prefix, schema and actual cache read/write counters reach accounting', async () => {
  const requests = [], tracked = [];
  const api = createOpenAiService({ apiKey: 'test-only', model: 'gpt-5.6-luna', client: { responses: { create: async request => {
    requests.push(request);
    return { status: 'completed', output_text: '{}', usage: { input_tokens: 800,
      input_tokens_details: { cached_tokens: 400, cache_write_tokens: 200 }, output_tokens: 120 } };
  } } } });
  for (const input of ['first private turn', 'different private turn']) await api.runStructured({ name: 'cache_test',
    instructions: 'fixed policy', input, schema: { parse: v => v }, jsonSchema: {}, maxOutputTokens: 220, costOptimized: true },
  { onUsage: usage => tracked.push(usage) });
  assert.deepEqual(requests[0].input[0], requests[1].input[0]);
  assert.deepEqual(requests[0].text, requests[1].text);
  assert.equal(requests[0].reasoning.effort, 'none');
  assert.equal(requests[0].store, false);
  assert.deepEqual(tracked[0], counts);
  assert.ok(Math.abs(estimateCost({ model: 'gpt-5.6-luna', ...counts }, readPricing()) - 0.000242) < 1e-12);
});

for (const persistent of [false, true]) {
  test(`session totals preserve unknown costs and isolation: sqlite=${persistent}`, async t => {
    const directory = mkdtempSync(join(tmpdir(), 'onaria-cost-v1-'));
    const filename = join(directory, 'usage.sqlite');
    const options = { filename, env, pricing: readPricing() };
    let ledger = persistent ? createSqliteUsageLedger(options) : createUsageLedger(options);
    t.after(() => { ledger.close?.(); rmSync(directory, { recursive: true, force: true }); });
    const identity = { userId: 'member', sessionId: 'session', plan: 'premium', taskType: 'simple_support' };
    for (let i = 0; i < 3; i++) {
      const lease = ledger.reserve(identity);
      lease.recordCall({ model: 'gpt-5.6-luna', modelTier: 'cheap' })(counts);
      lease.finish({ tier: 'cheap', provider: 'openai' });
    }
    if (persistent) { ledger.close(); ledger = createSqliteUsageLedger(options); }
    let summary = ledger.sessionSummary(identity);
    assert.equal(summary.sessionModelCalls, 3);
    assert.equal(summary.sessionInputTokens, 2400);
    assert.equal(summary.sessionCachedTokens, 1200);
    assert.ok(Math.abs(summary.sessionEstimatedCostUsd - 0.000726) < 1e-12);
    assert.equal(ledger.sessionSummary({ ...identity, userId: 'other' }).sessionModelCalls, 0);
    const lease = ledger.reserve(identity);
    lease.recordCall({ model: 'gpt-5.6-luna', modelTier: 'cheap' });
    lease.finish({ provider: 'local', fallback: true });
    summary = ledger.sessionSummary(identity);
    assert.equal(summary.sessionModelCalls, 4);
    assert.equal(summary.sessionEstimatedCostUsd, null);
    assert.equal(summary.sessionUnknownCostCalls, 1);
  });
}
