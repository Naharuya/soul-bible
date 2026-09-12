import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationService } from '../src/conversation_service.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { responseSchema } from '../src/schema.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

const body = () => ({ session: { sessionId: 'fallback-test', selectedEmotion: '불안', emotionIntensity: 7, turnCount: 2 },
  userMessage: '내일 발표가 걱정돼요', systemPromptVersion: 'ko-v1', allowedVerseIds: ['PHP_4_6_7'] });
const agent = { id: 'integrated' };
const enabled = { SOUL_COST_ROUTER_V1_ENABLED: 'false', SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only-key', OPENAI_MODEL: 'test-model' };

for (const [name, env] of Object.entries({ default: {}, local: { ...enabled, SOUL_AI_MODE: 'local' },
  disabled: { ...enabled, SOUL_MULTI_AGENT_ENABLED: 'false' }, noKey: { ...enabled, OPENAI_API_KEY: '' },
  whitespaceKey: { ...enabled, OPENAI_API_KEY: '  ' }, unknownMode: { ...enabled, SOUL_AI_MODE: 'other' },
})) {
  test(`stage 3: ${name} preserves local behavior without constructing an OpenAI client`, async () => {
    const service = createConversationService({ env, openAiFactory: () => assert.fail('external client constructed') });
    assert.deepEqual(await service(body(), agent, 'prior memory'), await createLocalConversationService()(body(), agent, 'prior memory'));
    assert.equal(service.mode, 'local conversation');
  });
}

for (const failure of ['provider', 'malformed', 'integrity', 'timeout', 'initialization']) {
  test(`stage 3: ${failure} falls back without leaking errors or mutating the request`, async () => {
    const logs = []; let signal;
    const payload = body(); const snapshot = structuredClone(payload);
    const service = createConversationService({ env: enabled, timeoutMs: 20, logger: { warn: (...args) => logs.push(args) },
      openAiFactory: () => {
        if (failure === 'initialization') throw Error('secret-key private-message');
        return { runStructured: async (task, options) => {
          signal = options.signal;
          if (failure === 'timeout') return new Promise(() => {});
          if (failure === 'provider') throw Error('secret-key private-message');
          if (failure === 'malformed') return { reflection: 42 };
          if (task.name === 'psychology_reflection') return psychologyOutput();
          return religionOutput({ perspective: '거짓 인용', guidance: '지어낸 경전', sourceRefs: ['fake'] });
        } };
      },
    });
    assert.deepEqual(await service(payload, agent), await createLocalConversationService()(payload, agent));
    assert.deepEqual(payload, snapshot);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][0], 'conversation_fallback');
    assert.doesNotMatch(JSON.stringify(logs), /secret-key|private-message|발표/);
    if (failure === 'timeout') assert.equal(signal.aborted, true);
  });
}

test('stage 7: configured OpenAI service still bypasses all external work on crisis', async () => {
  const service = createConversationService({ env: enabled, openAiFactory: () => assert.fail('must not construct') });
  const result = await service({ ...body(), userMessage: '지금 당장 죽고 싶고 계획을 세웠어요' }, agent);
  assert.equal(result.stage, 'crisis'); assert.equal(result.riskLevel, 3);
});

test('stage 3: invalid input is rejected rather than disguised as fallback', async () => {
  const service = createConversationService({ env: enabled, openAiFactory: () => assert.fail('must not construct') });
  await assert.rejects(service({ ...body(), religion: 'unknown' }, agent));
});

test('stage 6: fallback for a non-protestant request does not recommend a Bible verse', async () => {
  const service = createConversationService({ env: {}, openAiFactory: () => assert.fail('must not construct') });
  const result = await service({ ...body(), religion: 'buddhist' }, agent);
  assert.equal(result.suggestedVerseId, null); assert.equal(result.shouldOfferVerse, false);
  assert.notEqual(result.stage, 'verse_offer'); assert.doesNotMatch(result.message, /말씀|성경/);
  responseSchema.parse(result);
});

test('stage 3: a failed logger cannot break fallback', async () => {
  const service = createConversationService({ env: enabled, logger: { warn() { throw Error('logger down'); } },
    openAiFactory: () => { throw Error('provider down'); },
  });
  assert.deepEqual(await service(body(), agent), await createLocalConversationService()(body(), agent));
});

test('stage 3: a late timed-out result never starts the religion call', async () => {
  let finish; let calls = 0;
  const service = createConversationService({ env: enabled, timeoutMs: 15, logger: { warn() {} },
    openAiFactory: () => ({ runStructured: async () => {
      calls++;
      return new Promise((resolve) => { finish = resolve; });
    } }),
  });
  const result = await service(body(), agent);
  assert.deepEqual(result, await createLocalConversationService()(body(), agent));
  finish(psychologyOutput({ emotionSummary: '늦게 도착한 응답입니다.' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});
