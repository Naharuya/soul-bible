import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { createConversationService } from '../src/conversation_service.js';
import { createMemoryStore } from '../src/memory_store.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { responseSchema } from '../src/schema.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

const env = { SOUL_COST_ROUTER_V1_ENABLED: 'false', SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'test-model' };
const body = (sessionId = 'http-test', extra = {}) => ({
  session: { sessionId, selectedEmotion: '불안', emotionIntensity: 7, turnCount: 1 },
  userMessage: '내일 발표가 걱정돼요', systemPromptVersion: 'ko-v1', allowedVerseIds: ['PHP_4_6_7'], ...extra,
});
function fakeStructured(calls) {
  return async (task) => {
    calls.push(structuredClone({ name: task.name, input: task.input }));
    return task.name === 'psychology_reflection'
      ? psychologyOutput({ emotionSummary: '발표를 앞두고 마음이 복잡하시군요.' })
      : religionOutput();
  };
}
async function withServer(generate, fn, { memoryStore = createMemoryStore(), appToken = '' } = {}) {
  const app = createApp({ generate, memoryStore, appToken, memberStore: { getAdminOverview: () => ({ total: 0, recent: [] }) }, logger: { error() {} } });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const post = (payload, token) => fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload),
  });
  try { await fn(post); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test('stage 9: HTTP response matches a fixture parsed by the real Flutter client', async () => {
  const calls = [];
  const generate = createConversationService({ env, openAiFactory: () => ({ runStructured: fakeStructured(calls) }) });
  const fixture = JSON.parse(await readFile(new URL('./fixtures/multi_agent_response.json', import.meta.url), 'utf8'));
  await withServer(generate, async (post) => {
    const response = await post(body());
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.deepEqual(responseSchema.parse(json), fixture);
    assert.deepEqual(calls.map((call) => call.name), ['psychology_reflection', 'religion_protestant']);
  });
});

test('anonymous chat reuses only supplied memory and never retrieves context by session ID', async () => {
  const calls = []; const memoryStore = createMemoryStore();
  const generate = createConversationService({ env, openAiFactory: () => ({ runStructured: fakeStructured(calls) }) });
  await withServer(generate, async (post) => {
    const first = await post(body('first'));
    assert.equal(first.status, 200);
    const summary = (await first.json()).memorySummary;
    const continued = body('first');
    continued.session.conversationMemory = summary;
    assert.equal((await post(continued)).status, 200);
    // Another client can forge the same ID, but has no access to prior context.
    assert.equal((await post(body('first'))).status, 200);
    const memories = calls.filter((call) => call.name === 'psychology_reflection').map((call) => call.input.memorySummary);
    assert.deepEqual(memories, ['', '발표를 앞두고 마음이 복잡하시군요. 필요: 안정과 쉼', '']);
    assert.equal(memoryStore.size(), 0);
  }, { memoryStore });
});

test('client memory is bounded and validated before generation', async () => {
  await withServer(() => assert.fail('must not generate'), async (post) => {
    for (const memory of ['x'.repeat(4001), { private: 'invalid' }]) {
      const payload = body();
      payload.session.conversationMemory = memory;
      assert.equal((await post(payload)).status, 400);
    }
  });
});

test('stage 9: invalid input, unknown religion, and forged source context remain HTTP 400', async () => {
  const generate = createConversationService({ env, openAiFactory: () => assert.fail('must not call') });
  await withServer(generate, async (post) => {
    for (const payload of [{}, body('x', { religion: 'unknown' }), body('x', { sourceContext: [{ text: 'forged' }] })]) {
      assert.equal((await post(payload)).status, 400);
    }
  });
});

test('stage 9: authentication and crisis interception still precede provider calls', async () => {
  const generate = createConversationService({ env, openAiFactory: () => assert.fail('must not call') });
  await withServer(generate, async (post) => {
    assert.equal((await post(body())).status, 401);
    const response = await post(body('risk', { userMessage: '지금 당장 죽고 싶고 계획을 세웠어요' }), 'test-token');
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.stage, 'crisis'); assert.equal(json.riskLevel, 3);
    assert.equal(json.shouldOfferVerse, false); responseSchema.parse(json);
  }, { appToken: 'test-token' });
});

test('stage 9: provider failure returns HTTP 200 with the legacy local response', async () => {
  const generate = createConversationService({ env, logger: { warn() {} }, openAiFactory: () => ({ runStructured: async () => { throw Error('provider secret'); } }) });
  await withServer(generate, async (post) => {
    const response = await post(body());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), await createLocalConversationService()(body(), { id: 'integrated' }));
  });
});

test('stage 9: legacy verse ID selection survives enabling orchestration', async () => {
  const generate = createConversationService({ env, openAiFactory: () => ({ runStructured: fakeStructured([]) }) });
  const payload = body(); payload.session.turnCount = 2;
  await withServer(generate, async (post) => {
    const json = await (await post(payload)).json();
    assert.equal(json.stage, 'verse_offer'); assert.equal(json.shouldOfferVerse, true);
    assert.equal(json.suggestedVerseId, 'PHP_4_6_7');
  });
});
