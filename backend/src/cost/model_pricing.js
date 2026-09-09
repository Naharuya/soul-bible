// USD per million tokens. Deployment supplies a reviewed price table; unknown
// models deliberately have no guessed price. No provider keys are read here.
export function readPricing(env = process.env) {
  try {
    const parsed = JSON.parse(env.SOUL_MODEL_PRICING_JSON || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function estimateCost({ model, inputTokens = 0, cachedInputTokens = 0, outputTokens = 0 }, pricing = {}) {
  const price = Object.hasOwn(pricing, model ?? '') ? pricing[model] : null;
  if (!price || !['input', 'cachedInput', 'output'].every(key => Number.isFinite(price[key]) && price[key] >= 0)
    || ![inputTokens, cachedInputTokens, outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)
    || cachedInputTokens > inputTokens) return null;
  return ((inputTokens - cachedInputTokens) * price.input + cachedInputTokens * price.cachedInput + outputTokens * price.output) / 1_000_000;
}

export function estimateCacheSavings(usage, pricing = {}) {
  const cost = estimateCost(usage, pricing);
  const uncached = estimateCost({ ...usage, cachedInputTokens: 0 }, pricing);
  return cost === null || uncached === null ? null : Math.max(0, uncached - cost);
}
