// Reviewed 2026-09-12 against developers.openai.com/api/docs/models/gpt-5.6-{luna,terra,sol}.
// USD / 1M tokens; Sol promotional price needs review after 2026-11-21.
export const reviewedPricing = Object.freeze({
  'gpt-5.6-luna': { input: 0.20, cachedInput: 0.02, cacheWrite: 0.25, output: 1.20 },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, cacheWrite: 2.5, output: 12 },
  'gpt-5.6-sol': { input: 4, cachedInput: 0.4, cacheWrite: 5, output: 20 },
});
export function readPricing(env = process.env) {
  try {
    const parsed = JSON.parse(env.SOUL_MODEL_PRICING_JSON || JSON.stringify(reviewedPricing));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function estimateCost({ model, inputTokens = 0, cachedInputTokens = 0, cacheWriteTokens = 0, outputTokens = 0 }, pricing = {}) {
  const price = Object.hasOwn(pricing, model ?? '') ? pricing[model] : null;
  if (!price || !['input', 'cachedInput', 'output'].every(key => Number.isFinite(price[key]) && price[key] >= 0)
    || ![inputTokens, cachedInputTokens, cacheWriteTokens, outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)
    || cachedInputTokens + cacheWriteTokens > inputTokens
    || (cacheWriteTokens > 0 && (!Number.isFinite(price.cacheWrite) || price.cacheWrite < 0))) return null;
  return ((inputTokens - cachedInputTokens - cacheWriteTokens) * price.input + cachedInputTokens * price.cachedInput
    + cacheWriteTokens * (price.cacheWrite ?? price.input) + outputTokens * price.output) / 1_000_000;
}

export function estimateCacheSavings(usage, pricing = {}) {
  const cost = estimateCost(usage, pricing);
  const uncached = estimateCost({ ...usage, cachedInputTokens: 0 }, pricing);
  return cost === null || uncached === null ? null : Math.max(0, uncached - cost);
}
