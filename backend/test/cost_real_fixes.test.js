import assert from 'node:assert/strict';
import { test } from 'node:test';
import OpenAI from 'openai';
import { z } from 'zod';
import { safetyPreflight } from '../scripts/cost_safety_preflight.js';
import { createConversationService, fallbackReason } from '../src/conversation_service.js';
import { createOpenAiService } from '../src/openai_service.js';
import { costBody, costKnowledge } from './fixtures/cost_fixtures.js';
import { religionOutput } from './fixtures/agent_outputs.js';
import { applyRetrievalConfidence, noAnswerReligion } from '../src/knowledge/retrieval_confidence.js';

test('REAL preflight: shared corpus, zero V1 clients, models and specialist calls', async () => {
  assert.equal((await safetyPreflight()).modelCalls, 0);
});
const env = { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'fixture-only' };
for (const [error, expected] of [
  [new OpenAI.APIConnectionTimeoutError(), 'timeout'],
  [new OpenAI.APIUserAbortError(), 'timeout'],
  [Object.assign(Error(), { status: 408 }), 'timeout'],
  [Object.assign(Error(), { name: 'AbortError' }), 'timeout'],
  ...['REQUEST_TIMEOUT', 'CONVERSATION_TIMEOUT', 'ETIMEDOUT'].map(code => [Object.assign(Error(), { code }), 'timeout']),
  ...[500, 503].map(status => [Object.assign(Error(), { status }), 'provider_5xx']),
  [Object.assign(Error(), { status: 429 }), 'rate_limit'],
  ...[401, 403].map(status => [Object.assign(Error(), { status }), 'provider_auth']),
  [new SyntaxError(), 'malformed_json'], [Error(), 'agent_exception'],
  [z.object({ value: z.string() }).safeParse({}).error, 'schema_validation'],
]) test(`REAL error classification ${error.constructor.name}/${error.code ?? error.status ?? error.name}: ${expected}`, async () => {
  assert.equal(fallbackReason(error), expected);
  const logs = [];
  const service = createConversationService({ env, logger: { info: (_, value) => logs.push(value), warn() {} },
    openAiFactory: () => ({ runStructured() { throw error; } }) });
  await service(costBody('불안해요'));
  assert.equal(logs.at(-1).fallbackReason, expected);
  assert.equal(logs.at(-1).estimatedCostUsd, null);
});

test('real overall deadline aborts in-flight provider signal and records timeout', async () => {
  const logs = []; let cancelled = false;
  const service = createConversationService({ env, timeoutMs: 20, logger: { info: (_, value) => logs.push(value), warn() {} },
    openAiFactory: () => ({ runStructured(_task, { signal }) {
      return new Promise((_, reject) => signal.addEventListener('abort', () => { cancelled = true; reject(signal.reason); }, { once: true }));
    } }) });
  await service(costBody('불안해요'));
  assert.equal(cancelled, true);
  assert.equal(logs.at(-1).fallbackReason, 'timeout');
  assert.equal(logs.at(-1).estimatedCostUsd, null);
});

test('insufficient evidence limits citations; sufficient evidence preserves checked RAG response', () => {
  const draft = { tradition: 'protestant', religiousInsight: '"잠시 쉬어 보셔도 괜찮습니다."',
    suggestedPractice: { guidance: '잠시 쉬어 보세요.', reflectionQuestion: '어떤 쉼이 필요하신가요?' },
    sourceHints: ['protestant:cost-fixture:1'], caution: [] };
  const low = applyRetrievalConfidence(draft, 0.2);
  assert.equal(low.religiousInsight, noAnswerReligion().perspective);
  assert.deepEqual(low.sourceHints, []);
  const high = applyRetrievalConfidence(draft, 0.8);
  assert.equal(high.religiousInsight, draft.religiousInsight);
  assert.deepEqual(high.sourceHints, draft.sourceHints);
});

test('V1 with absent evidence limits even unquoted theological paraphrases; sufficient evidence survives', async () => {
  for (const sufficient of [false, true]) {
    const service = createConversationService({ env, logger: { info() {}, warn() {} },
      knowledgeProvider: sufficient ? costKnowledge : { async search(query) { return { tradition: query.tradition, query: query.query, results: [] }; } },
      openAiFactory: () => ({ async runStructured() { return religionOutput({ perspective: '합성 검증용 관점 설명입니다.' }); } }) });
    const result = await service(costBody('기도하며 쉬고 싶어요'));
    if (sufficient) assert.match(result.message, /합성 검증용 관점 설명/);
    else { assert.match(result.message, /충분히 신뢰할 만한 근거/); assert.doesNotMatch(result.message, /합성 검증용 관점 설명/); }
  }
});

test('incomplete RAG retains actual usage and a distinct fallback reason', async () => {
  const logs = [];
  const service = createConversationService({ env, knowledgeProvider: costKnowledge,
    logger: { info: (_, value) => logs.push(value), warn() {} },
    openAiFactory: options => createOpenAiService({ ...options, client: { responses: { async create(request) {
      assert.equal(request.max_output_tokens, 440);
      return { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: '{',
        usage: { input_tokens: 1200, output_tokens: 440 } };
    } } } }) });
  await service(costBody('기도하며 쉬고 싶어요'));
  assert.equal(logs.at(-1).fallbackReason, 'incomplete_output');
  assert.equal(logs.at(-1).outputTokens, 440);
  assert.ok(logs.at(-1).estimatedCostUsd > 0);
});

test('RAG stable policy/schema precede changing memory, sources and user; only RAG Luna gets 440', async () => {
  const tasks = [], logs = [];
  const service = createConversationService({ env, knowledgeProvider: costKnowledge,
    logger: { info: (_, value) => logs.push(value), warn() {} },
    openAiFactory: () => ({ async runStructured(task, options) {
      tasks.push(task); options.onUsage({ inputTokens: 1000, outputTokens: 160 }); return religionOutput();
    } }) });
  await service(costBody('기도하며 쉬고 싶어요'));
  await service({ ...costBody('신앙 안에서 쉬고 싶어요'), session: { ...costBody().session, sessionId: 'different', conversationMemory: 'different memory' } });
  assert.equal(tasks[0].instructions, tasks[1].instructions);
  assert.deepEqual(tasks[0].jsonSchema, tasks[1].jsonSchema);
  for (const task of tasks) {
    const labels = ['Common policy:', 'Safety policy:', 'Religion role', 'Citation/integrity rules:', 'Output schema:'];
    const indices = labels.map(label => task.instructions.indexOf(label));
    assert.ok(indices.every((n, i) => n >= 0 && (!i || n > indices[i - 1])));
    assert.equal(task.maxOutputTokens, 440);
    const keys = Object.keys(task.input);
    assert.ok(keys.indexOf('memorySummary') < keys.indexOf('sourceContext'));
    assert.ok(keys.indexOf('sourceContext') < keys.indexOf('userMessage'));
    assert.equal(task.input.sessionId, undefined);
  }
  assert.ok(logs.every(log => !log.fallback));
});
