import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeModel, classifyTask, taskTiers } from '../src/cost/model_router.js';

test('model routing honors task policy and tier ceiling without changing agent routing', () => {
  for (const [taskType, tier] of Object.entries(taskTiers)) {
    assert.equal(routeModel({ taskType, costTier: 'premium' }, { OPENAI_MODEL: 'legacy' }).tier, tier);
  }
  assert.deepEqual(routeModel({ taskType: 'complex', costTier: 'cheap' }, { OPENAI_CHEAP_MODEL: 'small' }), { tier: 'cheap', model: 'small' });
  assert.equal(routeModel({ costTier: 'standard' }, { OPENAI_MODEL: 'legacy' }).model, 'legacy');
  assert.equal(routeModel({ costTier: 'blocked' }).model, null);
});
test('server rules choose greetings and retrieval without trusting supplied tier', () => {
  assert.equal(classifyTask({ userMessage: '안녕하세요', plan: 'premium' }), 'greeting');
  assert.equal(classifyTask({ userMessage: '위로하는 성경 구절 찾아주세요' }), 'bible_search');
  assert.equal(classifyTask({ userMessage: '불교 자료 검색해주세요' }), 'religion_search');
  assert.equal(classifyTask({ userMessage: '내일 발표가 걱정돼요', taskType: 'premium' }), 'conversation');
});
