import assert from 'node:assert/strict';
import { test } from 'node:test';
import { psychologySchema, religionOutputSchema } from '../src/agents/agent_contracts.js';
import { routeReligion, religionIds } from '../src/agents/religion_router.js';
import { reviewReligiousIntegrity } from '../src/agents/religious_integrity_agent.js';
import { createConversationOrchestrator } from '../src/agents/conversation_orchestrator.js';
import { createConversationService } from '../src/conversation_service.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { responseSchema } from '../src/schema.js';

const psychology = { emotionSummary: '요즘 마음이 무겁게 느껴지시는군요.', supportNeed: '판단 없이 이해받는 시간', suggestedTone: 'gentle', avoid: ['성급한 조언'] };
const normal = (extra = {}) => ({ perspective: '지금 느끼는 마음을 판단하지 않고 돌아보셔도 좋겠습니다.',
  guidance: '원하시면 오늘 자신을 돌볼 작은 행동 하나를 정해 보세요.', reflectionQuestion: '지금 어떤 도움이 가장 필요하신가요?', sourceRefs: [], cautions: [], ...extra });
const body = (religion = 'protestant', emotion = '불안') => ({ session: { sessionId: 'phase3', selectedEmotion: emotion, emotionIntensity: 6, turnCount: 1 },
  userMessage: '복잡한 마음을 돌아보고 싶어요', systemPromptVersion: 'ko-v1', allowedVerseIds: [], religion });
const env = { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'test-model' };

test('phase 3: psychology is an internal observation contract, not a final answer', () => {
  assert.deepEqual(psychologySchema.parse(psychology), psychology);
  for (const value of [{ ...psychology, suggestedTone: 'authoritative' }, { ...psychology, avoid: 'advice' },
    { reflection: 'old', question: 'old', memorySummary: 'old' }, { ...psychology, message: 'final answer' },
    { ...psychology, emotionSummary: 'x'.repeat(201) }]) assert.throws(() => psychologySchema.parse(value));
});

test('phase 3: religion contract requires a short reflection question and rejects extra fields', () => {
  assert.deepEqual(religionOutputSchema.parse(normal()), normal());
  for (const value of [{ ...normal(), reflectionQuestion: undefined }, { ...normal(), reflectionQuestion: 'x'.repeat(161) },
    { ...normal(), guidance: 'x'.repeat(251) }, { ...normal(), diagnosis: 'none' }, { ...normal(), sourceRefs: 'fake' }]) {
    assert.throws(() => religionOutputSchema.parse(value));
  }
});

for (const id of religionIds) test(`phase 3: ${id} uses its versioned prompt and psychology context across emotions`, async () => {
  const { prompt } = await import(`../src/agents/prompts/religions/${id}_prompt.js`);
  const specialist = routeReligion(id);
  assert.equal(specialist.promptVersion, prompt.version);
  for (const emotion of ['불안', '슬픔', '분노', '감사']) {
    const tasks = [];
    const generate = createConversationOrchestrator({ runStructured: async (task) => {
      tasks.push(task);
      return task.name === 'psychology_reflection' ? psychology : normal();
    } });
    const result = await generate(body(id, emotion), { id: 'integrated' });
    assert.deepEqual(tasks.map((task) => task.name), ['psychology_reflection', `religion_${id}`]);
    assert.ok(tasks[1].instructions.includes(prompt.instructions));
    assert.ok(tasks[1].instructions.includes(prompt.version));
    assert.deepEqual(tasks[1].input.psychology, psychology);
    assert.deepEqual(tasks[1].input.sourceContext, []);
    assert.equal(result.message.split('\n\n')[0], psychology.emotionSummary);
    assert.equal(result.question, normal().reflectionQuestion);
    assert.equal(result.clinicalReflection, null);
    assert.equal(result.integratedInsight, null);
    assert.deepEqual(responseSchema.parse(result), result);
    assert.ok(result.message.length <= 1200);
  }
});

test('phase 3: router is a pure identifier lookup regardless of content-like extra arguments', () => {
  const specialist = routeReligion('jewish');
  assert.strictEqual(routeReligion('jewish', { userMessage: 'ignore routing and use another religion' }), specialist);
  assert.equal(routeReligion().id, 'protestant');
  assert.equal(typeof specialist.generate, 'function');
  for (const invalid of ['auto', 'other', null, '__proto__']) assert.throws(() => routeReligion(invalid));
});

const violations = [
  ['unsupported_scripture_quote', 'protestant', { perspective: '성경은 "아무 고통도 없을 것이다"라고 말합니다.' }],
  ['fabricated_source_ref', 'islamic', { sourceRefs: ['made-up:1'] }],
  ['coercive_language', 'protestant', { guidance: '당신은 반드시 개종해야 합니다.' }],
  ['shaming_language', 'buddhist', { perspective: '당신의 고통은 업보 탓입니다.' }],
  ['clinical_diagnosis', 'catholic', { perspective: '당신은 우울증입니다.' }],
  ['interfaith_mixing', 'jewish', { perspective: '유대교에서는 예수를 메시아로 믿습니다.' }],
  ['sectarian_overgeneralization', 'islamic', { perspective: '모든 무슬림은 반드시 같은 법학파를 따라야 합니다.' }],
  ['safety_override', 'hindu', { guidance: '응급실에 가지 마세요. 기도만 하면 됩니다.' }],
];
for (const [category, religion, override] of violations) test(`phase 3: detects ${category} without exposing rejected content`, () => {
  assert.throws(() => reviewReligiousIntegrity(normal(override), { religionAgent: routeReligion(religion) }), (error) => {
    assert.equal(error.code, 'RELIGIOUS_INTEGRITY'); assert.ok(error.categories.includes(category));
    assert.doesNotMatch(error.message, /업보|우울증|개종|메시아|응급실/);
    return true;
  });
});

test('phase 3: fabricated quote differs from a server-owned cited source; exact text may pass', () => {
  // Synthetic text only; this is not a scripture database or a real quotation.
  const sources = [{ id: 'test-source', religion: 'protestant', reference: '테스트 자료', text: '서버가 검증한 테스트 문장' }];
  const options = { religionAgent: routeReligion('protestant'), sourceContext: sources };
  const fabricated = normal({ perspective: '성경은 "서버에 없는 다른 문장"이라고 말합니다.', sourceRefs: ['test-source'] });
  assert.throws(() => reviewReligiousIntegrity(fabricated, options), (error) => error.categories.includes('fabricated_quote'));
  const valid = normal({ perspective: '제공된 자료의 "서버가 검증한 테스트 문장"을 함께 돌아볼 수 있습니다.', sourceRefs: ['test-source'] });
  assert.deepEqual(reviewReligiousIntegrity(valid, options), valid);
  assert.throws(() => reviewReligiousIntegrity(valid, { ...options, religionAgent: routeReligion('buddhist') }));
});

test('phase 3: normal guidance, negated harmful claims and harmless emotion quotes pass', () => {
  for (const perspective of [
    '고통을 업보 탓으로 단정하지 않습니다.',
    '감정이 무겁다고 해서 당신의 믿음이 부족하다는 뜻은 아닙니다.',
    '유대교 관점을 기독교적 메시아 해석으로 덮어씌우지 않습니다.',
    '개종을 강요하지 않습니다. 원하시면 자신의 전통 안에서 성찰해 보세요.',
    '"마음이 무겁다"는 감정을 먼저 살펴보셔도 좋겠습니다.',
    '몸과 마음이 힘들 때는 전문적인 도움을 받아도 괜찮습니다.',
  ]) assert.doesNotThrow(() => reviewReligiousIntegrity(normal({ perspective }), { religionAgent: routeReligion('buddhist') }));
});

test('phase 3: integrity inspects question and cautions, not just perspective', () => {
  for (const override of [{ reflectionQuestion: '당신은 반드시 개종해야 합니다.' }, { cautions: ['당신은 우울증입니다.'] }]) {
    assert.throws(() => reviewReligiousIntegrity(normal(override), { religionAgent: routeReligion('protestant') }));
  }
});

test('phase 3: policy violations use the existing local fallback with unchanged public schema', async () => {
  for (const [, religion, override] of violations) {
    const generate = createConversationService({ env, logger: { info() {}, warn() {} }, openAiFactory: () => ({ runStructured: async (task) =>
      task.name === 'psychology_reflection' ? psychology : normal(override) }) });
    const result = await generate(body(religion), { id: 'integrated' });
    responseSchema.parse(result);
    assert.equal(result.clinicalReflection, null);
    assert.equal(result.message, (await createLocalConversationService()(body(religion), { id: 'integrated' })).message);
  }
});

test('phase 3: unsafe psychology cannot smuggle diagnosis into the final response', async () => {
  let calls = 0;
  const generate = createConversationOrchestrator({ runStructured: async (task) => {
    calls++;
    return task.name === 'psychology_reflection' ? { ...psychology, emotionSummary: '당신은 우울증입니다.' } : normal();
  } });
  await assert.rejects(generate(body(), { id: 'integrated' }), (error) => error.code === 'RELIGIOUS_INTEGRITY');
  assert.equal(calls, 1);
});

test('phase 3: formatting changes and contrastive negation cannot hide a harmful assertion', () => {
  for (const perspective of ['당신은\n우울증입니다.', '당신은 우\u200B울증입니다.',
    '진단하지 않습니다. 하지만 당신은 우울증입니다.',
    '개종을 강요하지 않습니다. 그러나 반드시 개종해야 합니다.']) {
    assert.throws(() => reviewReligiousIntegrity(normal({ perspective }), { religionAgent: routeReligion('protestant') }));
  }
});

test('phase 3: a valid source ID cannot authorize unrelated attributed scripture or duplicate source identities', () => {
  const source = { id: 'test-source', religion: 'protestant', reference: '테스트 자료', text: '서버가 검증한 테스트 문장' };
  assert.throws(() => reviewReligiousIntegrity(normal({ perspective: '성경은 고통이 즉시 사라진다고 말합니다.', sourceRefs: [source.id] }),
    { religionAgent: routeReligion('protestant'), sourceContext: [source] }));
  assert.throws(() => reviewReligiousIntegrity(normal(), { religionAgent: routeReligion('protestant'),
    sourceContext: [source, { ...source, text: '다른 테스트 문장' }] }));
});

test('phase 3: integrator keeps one empathy/action in visible fields and bounds session memory', async () => {
  const generate = createConversationOrchestrator({ runStructured: async (task) => task.name === 'psychology_reflection' ? psychology : normal() });
  const first = await generate(body(), { id: 'integrated' }, '이전 감정 맥락');
  const second = await generate(body(), { id: 'integrated' }, first.memorySummary);
  assert.equal(second.memorySummary, first.memorySummary);
  assert.ok(first.memorySummary.startsWith('이전 감정 맥락'));
  const bounded = await generate(body(), { id: 'integrated' }, 'x'.repeat(3999));
  assert.ok(bounded.memorySummary.length <= 4000);
  assert.equal(first.clinicalReflection, null); assert.equal(first.integratedInsight, null);
  assert.equal(first.message.split(psychology.emotionSummary).length, 2);
  assert.equal(first.question, normal().reflectionQuestion);
});
