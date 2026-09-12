import assert from 'node:assert/strict';
import { test } from 'node:test';
import { numericUsage, promptSegments, nearestRank } from '../scripts/cost_router_real.js';

test('REAL reporting preserves unknown usage and excludes provider secrets and text', () => {
  assert.equal(numericUsage(undefined), null);
  const usage = numericUsage({ input_tokens: 10, output_tokens: 2, total_tokens: 12, secret: 'private',
    input_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 }, output_tokens_details: { reasoning_tokens: 1 } });
  assert.equal(usage.input_tokens_details.cached_tokens, 4);
  assert.equal(usage.input_tokens_details.cache_write_tokens, 3);
  assert.ok(!JSON.stringify(usage).includes('private'));
  assert.equal(numericUsage({}).input_tokens, null);
});
test('REAL prompt segments keep RAG and memory separate and label tokenizer estimates', () => {
  const result = promptSegments({ instructions: 'Static safety rules', jsonSchema: { type: 'object' }, maxOutputTokens: 220,
    input: { memorySummary: 'Prior summary', recentTurns: [{ role: 'user', content: 'Earlier turn' }], sourceContext: [{ text: 'Supplied source' }], userMessage: 'Current question', locale: 'ko-KR' } });
  assert.match(result.method, /estimate/);
  for (const field of ['systemPromptTokens', 'outputSchemaTokens', 'memoryTokens', 'ragContextTokens', 'userTokens', 'otherContextTokens']) assert.ok(result[field] > 0);
  assert.equal(nearestRank([4, 1, 3, 2], 0.5), 2);
  assert.equal(nearestRank([4, 1, 3, 2], 0.9), 4);
  assert.equal(nearestRank([], 0.9), null);
});
