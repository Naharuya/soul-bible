import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateCostGate } from '../src/cost/cost_gate.js';

test('free quota: normal, near limit downgrade, exhausted local', () => {
  assert.equal(evaluateCostGate().tier, 'standard');
  assert.equal(evaluateCostGate({ dailyUsage: { aiRequests: 4 } }).tier, 'cheap');
  assert.equal(evaluateCostGate({ dailyUsage: { aiRequests: 5 } }).tier, 'local');
  assert.equal(evaluateCostGate({ dailyUsage: { budgetUsedUsd: 0.03 } }).tier, 'local');
  assert.equal(evaluateCostGate({ monthlyUsage: { aiRequests: 155 } }).tier, 'local');
});
test('premium has higher quota, but premium model share stays at most 5 percent', () => {
  assert.equal(evaluateCostGate({ plan: 'premium', dailyUsage: { aiRequests: 6 } }).tier, 'standard');
  assert.equal(evaluateCostGate({ taskType: 'complex', globalUsage: { aiRequests: 99 } }).tier, 'standard');
  assert.equal(evaluateCostGate({ plan: 'premium', taskType: 'complex', globalUsage: { aiRequests: 19 } }).tier, 'premium');
  assert.equal(evaluateCostGate({ plan: 'premium', taskType: 'complex', globalUsage: { aiRequests: 18 } }).tier, 'standard');
});
test('safety and RAG do not require an AI quota; explicit invalid policy fails closed', () => {
  for (const taskType of ['crisis', 'self_harm', 'immediate_safety']) {
    assert.equal(evaluateCostGate({ taskType, dailyUsage: { aiRequests: 9999 } }).reason, 'safety_bypass');
  }
  assert.equal(evaluateCostGate({ taskType: 'bible_search', dailyUsage: { aiRequests: 9999 } }).tier, 'rag');
  assert.equal(evaluateCostGate({}, { SOUL_FREE_DAILY_AI_CALLS: 'bad' }).tier, 'local');
  assert.equal(evaluateCostGate({}, { SOUL_FREE_DAILY_AI_BUDGET_USD: '0' }).tier, 'local');
  assert.equal(evaluateCostGate({ dailyUsage: { aiRequests: 5 } }, { SOUL_FREE_DAILY_AI_CALLS: '10' }).tier, 'standard');
});
