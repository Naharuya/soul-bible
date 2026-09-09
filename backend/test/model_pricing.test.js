import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateCost, estimateCacheSavings, readPricing } from '../src/cost/model_pricing.js';

test('synthetic prices subtract cached tokens exactly once', () => {
  const pricing = { mock: { input: 2, cachedInput: 0.5, output: 8 } };
  const usage = { model: 'mock', inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 };
  assert.equal(estimateCost(usage, pricing), 0.0022);
  assert.ok(Math.abs(estimateCacheSavings(usage, pricing) - 0.0006) < 1e-12);
  assert.equal(estimateCost({ ...usage, model: 'unknown' }, pricing), null);
  assert.equal(estimateCost({ ...usage, cachedInputTokens: 1001 }, pricing), null);
  assert.deepEqual(readPricing({ SOUL_MODEL_PRICING_JSON: 'invalid' }), {});
  assert.equal(estimateCost({ model: 'toString' }), null);
});
