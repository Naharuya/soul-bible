import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeReligion, resolveReligion, religionIds } from '../src/agents/religion_router.js';
import { specialistResultSchema } from '../src/agents/specialist_result.js';
import { reviewReligiousIntegrity } from '../src/agents/religious_integrity_agent.js';
import { createConversationOrchestrator } from '../src/agents/conversation_orchestrator.js';
import { createConversationService } from '../src/conversation_service.js';
import { responseSchema } from '../src/schema.js';

const psychology = { emotionSummary: '마음이 무거우시군요.', supportNeed: '안전한 돌봄', suggestedTone: 'gentle', avoid: ['치료 중단'] };
const draft = { perspective: '자신을 탓하지 않고 돌보셔도 괜찮습니다.', guidance: '믿을 만한 사람에게 도움을 요청해 보세요.', reflectionQuestion: '어떤 도움이 필요하신가요?', sourceRefs: [], cautions: [] };
const body = (userMessage, religion) => ({ session: { sessionId: 'specialization', selectedEmotion: '불안', emotionIntensity: 5, turnCount: 2 }, userMessage, religion, systemPromptVersion: 'ko-v1', allowedVerseIds: ['test-verse'] });
const messages = ['기독교에서 기도는 무엇인가요?', '가톨릭 성경과 성사를 알고 싶어요.', '불교의 연기는 무엇인가요?', '유대교 토라를 알고 싶어요.', '이슬람의 기도를 알려주세요.', '힌두교 다르마는 무엇인가요?', '유교의 효는 무엇인가요?'];
for (const [index, id] of religionIds.entries()) test(`specialization: question routes to ${id} and uses common contract`, async () => {
  assert.equal(resolveReligion({ userMessage: messages[index] }).tradition, id);
  const specialist = routeReligion(id);
  for (const field of ['identity', 'supportedTradition', 'doctrineBoundaries', 'allowedSources', 'forbiddenClaims', 'pastoralStyle', 'responseRules', 'safetyRules']) assert.ok(specialist[field]);
  const canonical = await specialist.generateResult({ psychology }, async () => draft);
  assert.deepEqual(specialistResultSchema.parse(canonical), canonical);
  assert.deepEqual(reviewReligiousIntegrity(canonical, { religionAgent: specialist }), canonical);
  const calls = [];
  const generate = createConversationOrchestrator({ runStructured: async task => { calls.push(task.name); return task.name === 'psychology_reflection' ? psychology : draft; } });
  const result = await generate(body(messages[index]));
  assert.deepEqual(calls, ['psychology_reflection', `religion_${id}`]);
  responseSchema.parse(result);
  if (id !== 'protestant') assert.equal(result.shouldOfferVerse, false);
});

test('specialization: unclear keeps legacy default; explicit selection wins; mixed asks context', async () => {
  assert.deepEqual(resolveReligion({ userMessage: '마음이 힘들어요.' }), { tradition: 'protestant', reason: 'legacy_default' });
  assert.equal(resolveReligion({ religion: 'jewish', userMessage: '기독교와 유대교' }).tradition, 'jewish');
  assert.equal(resolveReligion({ userMessage: '불교와 기독교' }).tradition, null);
  const calls = [];
  const generate = createConversationOrchestrator({ runStructured: async task => { calls.push(task.name); return psychology; } });
  const result = await generate(body('불교와 기독교 관점이 궁금해요.'));
  assert.deepEqual(calls, ['psychology_reflection']);
  assert.match(result.question, /어느 전통/);
  assert.equal(result.shouldOfferVerse, false);
});

test('specialization: self-harm bypasses all specialists', async () => {
  const generate = createConversationOrchestrator({ runStructured: async () => assert.fail('Safety must run first'), selectReligion: () => assert.fail('must not route') });
  const result = await generate(body('죽고 싶어요. 불교에서 어떻게 보나요?'));
  assert.equal(result.stage, 'crisis');
});

test('specialization: mental health plus religion keeps psychology before religious support', async () => {
  const calls = [];
  const generate = createConversationOrchestrator({ runStructured: async task => {
    calls.push(task.name);
    if (task.name === 'psychology_reflection') return psychology;
    assert.deepEqual(task.input.psychology.avoid, ['치료 중단']);
    return { ...draft, guidance: '치료와 상담을 계속하며 원하시면 기도를 함께 하셔도 좋습니다.' };
  } });
  const result = await generate(body('우울증 치료 중인데 가톨릭 기도가 도움이 될까요?'));
  assert.deepEqual(calls, ['psychology_reflection', 'religion_catholic']);
  assert.ok(result.message.startsWith(psychology.emotionSummary));
  assert.match(result.message, /치료와 상담을 계속/);
});

for (const text of ['하나님이 저에게 직접 계시하셨습니다.', '이 상황은 하나님의 뜻입니다.', '기도하면 반드시 완치됩니다.', '약을 끊고 기도만 하세요.']) test(`specialization: blocks added integrity violation: ${text}`, () => {
  assert.throws(() => reviewReligiousIntegrity({ ...draft, guidance: text }, { religionAgent: routeReligion() }), error => error.code === 'RELIGIOUS_INTEGRITY');
});

test('specialization: false flag keeps preexisting local behavior for every question', async () => {
  const logger = { info() {}, warn() {} };
  const off = createConversationService({ env: { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'false' }, logger, openAiFactory: () => assert.fail('disabled') });
  const baseline = createConversationService({ env: {}, logger });
  for (const message of [...messages, '불교와 기독교', '마음이 힘들어요.']) assert.deepEqual(await off(body(message)), await baseline(body(message)));
});

test('specialization: inferred non-Christian provider failure never offers Bible verses', async () => {
  const generate = createConversationService({ env: { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-placeholder' }, logger: { info() {}, warn() {} }, openAiFactory: () => { throw Error('offline'); } });
  for (const message of [messages[2], '기독교와 불교']) {
    const result = await generate(body(message));
    assert.equal(result.shouldOfferVerse, false);
    assert.equal(result.suggestedVerseId, null);
    responseSchema.parse(result);
  }
});
