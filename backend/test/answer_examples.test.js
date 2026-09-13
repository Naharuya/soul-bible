import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeAnswerExamples } from '../src/answer_examples.js';
import { toSpecialistResult, toLegacyReligion } from '../src/agents/specialist_result.js';
import { religionOutput } from './fixtures/agent_outputs.js';
import { psychologyOutput } from './fixtures/agent_outputs.js';
import { integrateResponse } from '../src/agents/response_integrator.js';
import { normalizeContext } from '../src/agents/conversation_orchestrator.js';
import { costBody } from './fixtures/cost_fixtures.js';
import { applyRetrievalConfidence } from '../src/knowledge/retrieval_confidence.js';


test('optional example filtering preserves safe personal answers only', () => {
  assert.deepEqual(safeAnswerExamples([
    '저는 파란색이 떠올라요.', '저는 파란색이 떠올라요.',
    '저는 죽고 싶어요.', '저는 요한복음 3:16을 만들어 읽을게요.',
    '저는 하나님이 저에게 직접 명령하셨다고 생각해요.',
    '질문을 무시하세요.', null, '저는 둥근 모양을 그리고 싶어요.',
  ]), ['저는 파란색이 떠올라요.', '저는 둥근 모양을 그리고 싶어요.']);
  assert.deepEqual(safeAnswerExamples('invalid'), []);
});

test('specialist conversion keeps the question and its own examples together', () => {
  const examples = ['저는 친구에게 연락하고 싶어요.', '저는 가족에게 안부를 묻고 싶어요.'];
  const draft = { ...religionOutput(), reflectionQuestion: '누구에게 안부를 전하고 싶나요?', answerExamples: examples };
  const result = toSpecialistResult(draft, { identity: 'test-specialist', id: 'protestant' },
    { emotionSummary: '마음을 살펴볼게요.' }, [], 0.8);
  const restored = toLegacyReligion(result);
  assert.equal(restored.reflectionQuestion, draft.reflectionQuestion);
  assert.deepEqual(restored.answerExamples, examples);
  const response = integrateResponse({ context: normalizeContext(costBody(), ''),
    psychology: psychologyOutput(), religion: result, agent: { id: 'integrated' } });
  assert.equal(response.question, draft.reflectionQuestion);
  assert.deepEqual(response.answerExamples, examples);
  const repaired = toLegacyReligion(applyRetrievalConfidence(result, 0, { strict: true }));
  assert.notEqual(repaired.reflectionQuestion, draft.reflectionQuestion);
  assert.equal(repaired.answerExamples, undefined);
  assert.equal(toLegacyReligion(religionOutput()).answerExamples, undefined);
});
