import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationOrchestrator, normalizeContext } from '../src/agents/conversation_orchestrator.js';
import { routeReligion, religionIds } from '../src/agents/religion_router.js';
import { reviewReligiousIntegrity } from '../src/agents/religious_integrity_agent.js';
import { responseSchema } from '../src/schema.js';
import { assessCrisis, crisisResponse } from '../src/crisis.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

export function request(overrides = {}) {
  return { session: { sessionId: 'agent-test', selectedEmotion: '불안', emotionIntensity: 7, turnCount: 1 },
    userMessage: '내일 발표를 앞두고 마음이 복잡해요', systemPromptVersion: 'ko-v1',
    allowedVerseIds: ['PHP_4_6_7'], locale: 'ko-KR', ...overrides };
}

function model(calls = []) {
  return async (task) => {
    calls.push(task);
    if (task.name === 'psychology_reflection') return psychologyOutput({ emotionSummary: '발표를 앞두고 마음이 복잡하게 느껴지시는군요.' });
    return religionOutput();
  };
}

test('stage 4: normalizes old requests without changing them', () => {
  const body = request(); const before = structuredClone(body);
  const ctx = normalizeContext(body, 'earlier summary');
  assert.deepEqual(body, before);
  assert.equal(ctx.sessionId, body.session.sessionId);
  assert.equal(ctx.religion, 'protestant');
  assert.equal(ctx.emotion, '불안'); assert.equal(ctx.intensity, 7);
  assert.equal(ctx.memorySummary, 'earlier summary');
  assert.deepEqual(ctx.conversationState, body.session);
  assert.throws(() => normalizeContext({ ...body, unexpected: true }));
});

test('stage 4: runs psychology before religion and returns the original response schema', async () => {
  const calls = [];
  const generate = createConversationOrchestrator({ runStructured: model(calls) });
  const result = await generate(request(), { id: 'integrated' }, 'old summary');
  assert.deepEqual(calls.map((c) => c.name), ['psychology_reflection', 'religion_protestant']);
  assert.equal(calls[0].input.memorySummary, 'old summary');
  assert.deepEqual(calls[1].input.psychology, psychologyOutput({ emotionSummary: '발표를 앞두고 마음이 복잡하게 느껴지시는군요.' }));
  assert.equal(result.memorySummary, 'old summary\n발표를 앞두고 마음이 복잡하게 느껴지시는군요. 필요: 안정과 쉼');
  assert.equal(result.suggestedVerseId, null);
  assert.equal(result.shouldOfferVerse, false);
  assert.deepEqual(responseSchema.parse(result), result);
});

test('stage 5: missing religion defaults to protestant and every explicit route is supported', () => {
  assert.equal(routeReligion().id, 'protestant');
  for (const id of religionIds) assert.equal(routeReligion(id).id, id);
  for (const invalid of ['unknown', '__proto__', 'constructor', '', null]) assert.throws(() => routeReligion(invalid));
});

test('stage 6: each specialist uses the common contract and passes general content integrity', async () => {
  for (const id of religionIds) {
    const specialist = routeReligion(id);
    const result = await specialist.generate({ userMessage: '쉼이 필요해요', emotion: '지침', intensity: 6,
      locale: 'ko-KR', psychology: psychologyOutput(), sourceContext: [] }, model());
    assert.deepEqual(Object.keys(result).sort(), ['cautions', 'guidance', 'perspective', 'reflectionQuestion', 'sourceRefs']);
    assert.deepEqual(result.sourceRefs, []);
    assert.deepEqual(reviewReligiousIntegrity(result, { religionAgent: specialist, sourceContext: [] }), result);
    assert.throws(() => reviewReligiousIntegrity({ ...result, guidance: '경전은 "출처 없는 인용문"이라고 말합니다.' }, { religionAgent: specialist }));
    assert.throws(() => reviewReligiousIntegrity({ ...result, sourceRefs: ['fabricated:1'] }, { religionAgent: specialist }));
  }
});

test('stage 7: all existing risk levels bypass psychology and religion', async () => {
  let calls = 0;
  const generate = createConversationOrchestrator({ runStructured: async () => { calls++; throw Error('must not call'); } });
  for (const message of ['사라지고 싶어요', '죽고 싶어요', '지금 당장 죽고 싶고 계획을 세웠어요', '숨을 못 쉬어요', '지금 당장 해치고 싶어요', '환청이 들려요']) {
    const result = await generate(request({ userMessage: message }), { id: 'bible_ko' });
    assert.deepEqual(result, crisisResponse('불안', assessCrisis(message)));
    assert.equal(result.shouldOfferVerse, false);
  }
  assert.equal(calls, 0);
});

test('stage 4: malformed psychology stops before religion', async () => {
  let calls = 0;
  const generate = createConversationOrchestrator({ runStructured: async () => { calls++; return { reflection: 42 }; } });
  await assert.rejects(generate(request(), { id: 'integrated' }));
  assert.equal(calls, 1);
});

test('stage 6: non-protestant requests never reuse the Flutter Bible catalogue', async () => {
  for (const religion of religionIds.filter((id) => id !== 'protestant')) {
    const body = request({ religion }); body.session.turnCount = 3;
    const calls = [];
    const result = await createConversationOrchestrator({ runStructured: model(calls) })(body, { id: 'integrated' });
    assert.equal(result.suggestedVerseId, null); assert.equal(result.shouldOfferVerse, false);
    assert.notEqual(result.stage, 'verse_offer');
    assert.deepEqual(calls[1].input.sourceContext, []);
  }
});
