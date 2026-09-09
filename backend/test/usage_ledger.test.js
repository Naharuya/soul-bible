import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createUsageLedger } from '../src/cost/usage_ledger.js';

test('ledger sums usage, caches, cost and hashes identifiers without storing prompts', () => {
  const ledger = createUsageLedger({ pricing: { mock: { input: 2, cachedInput: 0.5, output: 8 } } });
  const lease = ledger.reserve({ userId: 'private-user', sessionId: 'private-session', prompt: 'secret-message', plan: 'free' });
  lease.recordCall({ model: 'mock', modelTier: 'cheap' })({ inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 });
  lease.recordCall({ model: 'mock', modelTier: 'standard' })({ inputTokens: 1000, outputTokens: 100 });
  lease.finish({ tier: 'standard', provider: 'openai' }); lease.finish();
  const overview = ledger.overview();
  assert.equal(overview.today.modelCalls, 2); assert.equal(overview.today.aiRequests, 1);
  assert.equal(overview.today.inputTokens, 2000); assert.equal(overview.cacheHitRate, 0.2);
  assert.equal(overview.today.estimatedCostUsd, 0.005); assert.equal(overview.averageCostPerMember, 0.005);
  assert.equal(overview.routing.standard, 1);
  assert.doesNotMatch(JSON.stringify(ledger.entries()), /private-user|private-session|secret-message|prompt/);
});
test('atomic reservations prevent concurrent overspend and ID rotation cannot reset anonymous quota', () => {
  const ledger = createUsageLedger();
  const leases = Array.from({ length: 10 }, (_, i) => ledger.reserve({ sessionId: `${i}`, plan: 'premium' }));
  assert.equal(leases.filter(lease => ['standard', 'cheap'].includes(lease.decision.tier)).length, 5);
  assert.equal(ledger.overview().today.budgetUsedUsd, 0.03);
});
test('unknown usage keeps reservation and unknown costs are not reported as zero', () => {
  const ledger = createUsageLedger(); const lease = ledger.reserve();
  const track = lease.recordCall({ model: 'unknown', modelTier: 'cheap' });
  lease.finish({ fallback: true, fallbackReason: 'timeout' });
  track({ inputTokens: 20, outputTokens: 10 });
  assert.equal(ledger.overview().today.estimatedCostUsd, null);
  assert.equal(ledger.overview().today.inputTokens, 20);
  assert.equal(ledger.overview().today.budgetUsedUsd, 0.006);
});
test('UTC daily reset retains monthly quota, bounded event retention does not erase quota', () => {
  let date = new Date('2026-09-09T23:59:00Z');
  const ledger = createUsageLedger({ now: () => date, maxEntries: 1, env: { SOUL_FREE_MONTHLY_AI_CALLS: '1' } });
  const lease = ledger.reserve(); lease.recordCall({ model: 'unknown', modelTier: 'standard' }); lease.finish();
  date = new Date('2026-09-10T00:00:00Z');
  assert.equal(ledger.reserve().decision.tier, 'local');
  date = new Date('2026-10-01T00:00:00Z');
  assert.equal(ledger.reserve().decision.tier, 'standard');
});
test('local requests and failed provider initialization consume no AI quota', () => {
  const ledger = createUsageLedger();
  ledger.reserve({ taskType: 'rule' }).finish(); ledger.reserve().finish({ fallback: true });
  assert.equal(ledger.overview().today.aiRequests, 0);
  assert.equal(ledger.overview().today.budgetUsedUsd, 0);
});
