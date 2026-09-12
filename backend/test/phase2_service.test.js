import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationService } from '../src/conversation_service.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { createConversationOrchestrator } from '../src/agents/conversation_orchestrator.js';
import { religionIds } from '../src/agents/religion_router.js';
import { responseSchema } from '../src/schema.js';
import { createApp } from '../src/app.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

const enabled = { SOUL_COST_ROUTER_V1_ENABLED: 'false', SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only-key', OPENAI_MODEL: 'test-model' };
const request = (extra = {}) => ({ session: { sessionId: 'phase2', selectedEmotion: '불안', emotionIntensity: 7, turnCount: 1 },
  userMessage: 'private-user-message', systemPromptVersion: 'ko-v1', allowedVerseIds: ['PHP_4_6_7'], ...extra });
const agent = { id: 'integrated' };
function capture() {
  const info = []; const warn = [];
  return { info, warn, logger: { info: (...args) => info.push(args), warn: (...args) => warn.push(args) } };
}
function mockService(calls = []) {
  return { runStructured: async (task, options) => {
    calls.push(task.name);
    options.onUsage?.({ inputTokens: 10, outputTokens: 5 });
    if (task.name === 'psychology_reflection') return psychologyOutput();
    return religionOutput();
  } };
}

for (const [name, env, reason] of [
  ['default', {}, null], ['local', { ...enabled, SOUL_AI_MODE: 'local' }, null],
  ['flag off', { ...enabled, SOUL_MULTI_AGENT_ENABLED: 'false' }, null],
  ['missing key', { ...enabled, OPENAI_API_KEY: '' }, 'missing_api_key'],
]) test(`phase 2: ${name} makes zero provider calls and logs only safe metadata`, async () => {
  const log = capture();
  const generate = createConversationService({ env, logger: log.logger, openAiFactory: () => assert.fail('must not initialize') });
  assert.deepEqual(await generate(request(), agent), await createConversationOrchestrator()(request(), agent));
  const entry = log.info.at(-1)[1];
  assert.equal(entry.provider, 'local'); assert.equal(entry.fallback, Boolean(reason)); assert.equal(entry.fallbackReason, reason);
  assert.equal(entry.model, null); assert.equal(entry.modelCalls, 0);
});

test('phase 2: enabled success uses model output, preserves schema, and records token counts', async () => {
  const calls = []; const log = capture();
  const generate = createConversationService({ env: enabled, logger: log.logger, openAiFactory: () => mockService(calls) });
  const result = await generate(request(), agent);
  assert.ok(result.message.startsWith('마음이 복잡하시군요.'));
  assert.notDeepEqual(result, await createLocalConversationService()(request(), agent));
  assert.deepEqual(responseSchema.parse(result), result);
  assert.deepEqual(calls, ['psychology_reflection', 'religion_protestant']);
  const entry = log.info.at(-1)[1];
  assert.equal(entry.provider, 'openai'); assert.equal(entry.model, 'test-model'); assert.equal(entry.fallback, false);
  assert.equal(entry.modelCalls, 2); assert.equal(entry.inputTokens, 20); assert.equal(entry.outputTokens, 10);
  assert.ok(entry.latencyMs >= 0);
  assert.doesNotMatch(JSON.stringify(log), /test-only-key|private-user-message|private-summary/);
});

for (const [name, fail, reason] of [
  ['timeout', () => new Promise(() => {}), 'timeout'],
  ['SDK timeout', () => { throw Object.assign(Error('private'), { name: 'APIConnectionTimeoutError' }); }, 'timeout'],
  ['connection', () => { throw Object.assign(Error('private'), { name: 'APIConnectionError' }); }, 'connection_failure'],
  ['429', () => { throw Object.assign(Error('private'), { status: 429 }); }, 'rate_limit'],
  ['401', () => { throw Object.assign(Error('private'), { status: 401 }); }, 'provider_auth'],
  ['403', () => { throw Object.assign(Error('private'), { status: 403 }); }, 'provider_auth'],
  ['503', () => { throw Object.assign(Error('private'), { status: 503 }); }, 'provider_5xx'],
  ['malformed JSON', () => JSON.parse('not-json'), 'malformed_json'],
  ['schema failure', () => ({ reflection: 42 }), 'schema_validation'],
  ['agent exception', () => { throw Error('private'); }, 'agent_exception'],
]) test(`phase 2: ${name} returns local fallback and records the reason category`, async () => {
  const log = capture();
  const generate = createConversationService({ env: enabled, logger: log.logger, timeoutMs: 20, openAiFactory: () => ({ runStructured: fail }) });
  const result = await generate(request(), agent);
  assert.deepEqual(result, await createLocalConversationService()(request(), agent));
  const entry = log.info.at(-1)[1];
  assert.equal(entry.provider, 'local'); assert.equal(entry.fallback, true); assert.equal(entry.fallbackReason, reason);
  assert.equal(entry.model, 'test-model'); assert.ok(entry.latencyMs >= 0);
  assert.doesNotMatch(JSON.stringify([result, log]), /private|test-only-key/);
});

test('phase 2: an unsupported specialist at runtime falls back; invalid request religion remains an error', async () => {
  const log = capture(); const calls = [];
  const generate = createConversationService({ env: enabled, logger: log.logger, openAiFactory: () => mockService(calls),
    selectReligion: () => { throw Error('unsupported specialist'); },
  });
  assert.deepEqual(await generate(request(), agent), await createLocalConversationService()(request(), agent));
  assert.equal(log.info.at(-1)[1].fallbackReason, 'religion_routing');
  assert.deepEqual(calls, ['psychology_reflection']);
  await assert.rejects(generate(request({ religion: 'unsupported' }), agent));
  assert.equal(log.info.length, 1);
});

test('phase 2: critical input bypasses client creation and is never labelled fallback', async () => {
  const log = capture();
  const generate = createConversationService({ env: enabled, logger: log.logger, openAiFactory: () => assert.fail('must not call') });
  const result = await generate(request({ userMessage: '지금 당장 죽고 싶고 계획을 세웠어요' }), agent);
  assert.equal(result.stage, 'crisis'); assert.equal(result.riskLevel, 3);
  assert.equal(log.info.at(-1)[1].fallback, false); assert.equal(log.info.at(-1)[1].modelCalls, 0);
});

test('phase 2: every religion uses the correct specialist without unverified citations', async () => {
  for (const religion of [undefined, ...religionIds]) {
    const calls = [];
    const generate = createConversationService({ env: enabled, logger: capture().logger, openAiFactory: () => mockService(calls) });
    const result = await generate(request(religion ? { religion } : {}), agent);
    assert.deepEqual(calls, ['psychology_reflection', `religion_${religion ?? 'protestant'}`]);
    responseSchema.parse(result);
  }
});

test('phase 2: invented religious quotation is rejected after the model and uses fallback', async () => {
  const log = capture(); const mock = mockService();
  const generate = createConversationService({ env: enabled, logger: log.logger, openAiFactory: () => ({ runStructured: async (task, options) => {
    const result = await mock.runStructured(task, options);
    return task.name.startsWith('religion_') ? { ...result, guidance: '지어낸 경전 인용', sourceRefs: ['made-up-source'] } : result;
  } }) });
  assert.deepEqual(await generate(request(), agent), await createLocalConversationService()(request(), agent));
  assert.equal(log.info.at(-1)[1].fallbackReason, 'religious_integrity');
});

test('phase 2: flag-gated factory works through the unchanged HTTP route', async () => {
  const log = capture(); const calls = [];
  const app = createApp({ generate: createConversationService({ env: enabled, logger: log.logger, openAiFactory: () => mockService(calls) }), memberStore: {}, logger: { error() {} } });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request()) });
    assert.equal(response.status, 200); responseSchema.parse(await response.json()); assert.equal(calls.length, 2);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('phase 2: concurrent requests share one client but keep usage and latency records separate', async () => {
  const log = capture(); let initializations = 0;
  const generate = createConversationService({ env: enabled, logger: log.logger, openAiFactory: async () => {
    initializations++;
    await new Promise((resolve) => setImmediate(resolve));
    return mockService();
  } });
  await Promise.all(Array.from({ length: 4 }, () => generate(request(), agent)));
  assert.equal(initializations, 1); assert.equal(log.info.length, 4);
  for (const [, entry] of log.info) {
    assert.equal(entry.modelCalls, 2); assert.equal(entry.inputTokens, 20); assert.equal(entry.outputTokens, 10);
  }
});

test('phase 2: a throwing telemetry sink cannot change a successful response', async () => {
  const generate = createConversationService({ env: enabled, logger: { info() { throw Error('sink failed'); } }, openAiFactory: () => mockService() });
  assert.ok((await generate(request(), agent)).message.startsWith('마음이 복잡하시군요.'));
});

test('phase 2: request validation errors produce neither calls nor fallback telemetry', async () => {
  const log = capture();
  const generate = createConversationService({ env: enabled, logger: log.logger, openAiFactory: () => assert.fail('must not call') });
  await assert.rejects(generate({})); assert.equal(log.info.length, 0); assert.equal(log.warn.length, 0);
});
