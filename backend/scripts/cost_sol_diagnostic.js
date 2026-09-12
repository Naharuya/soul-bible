import OpenAI from 'openai';
import { writeFileSync, mkdirSync } from 'node:fs';
import { safetyPreflight } from './cost_safety_preflight.js';
import { numericUsage } from './cost_router_real.js';
import { fallbackReason } from '../src/conversation_service.js';
import { modelForCostTier } from '../src/cost/model_router.js';
import { estimateCost, readPricing } from '../src/cost/model_pricing.js';
import { religionJsonSchema, religionOutputSchema } from '../src/agents/agent_contracts.js';
import { pathToFileURL } from 'node:url';
import { runRealPreflight } from './cost_real_preflight.js';

export async function runSolDiagnostic() {
await safetyPreflight();
const model = modelForCostTier('premium', process.env);
const api = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 6000, maxRetries: 0,
  baseURL: 'https://api.openai.com/v1', logLevel: 'off' });
const results = [];
async function probe(stage, structured, timeoutMs = 6000) {
  const started = performance.now();
  const entry = { stage, model, timeoutMs, usage: null, estimatedCostUsd: null };
  try {
    const response = await api.responses.create({ model, store: false, reasoning: { effort: 'none' },
      input: structured ? 'No religious sources are supplied. In Korean, acknowledge insufficient evidence briefly, offer optional rest and one gentle question. Do not invent religious content.' : 'Reply with exactly OK.',
      max_output_tokens: structured ? 320 : 32,
      ...(structured ? { text: { format: { type: 'json_schema', name: 'sol_diagnostic', strict: true, schema: religionJsonSchema } } } : {}),
    }, { timeout: timeoutMs });
    entry.status = response.status;
    entry.providerSuccess = response.status === 'completed';
    entry.usage = numericUsage(response.usage);
    entry.output = response.output_text;
    if (entry.output?.includes(process.env.OPENAI_API_KEY)) throw Error('Secret suppressed');
    if (response.status !== 'completed') entry.failure = 'incomplete_output';
    else if (structured) religionOutputSchema.parse(JSON.parse(response.output_text));
    else if (response.output_text.trim() !== 'OK') entry.failure = 'unexpected_output';
    if (entry.usage?.input_tokens != null && entry.usage?.output_tokens != null) entry.estimatedCostUsd = estimateCost({ model,
      inputTokens: entry.usage.input_tokens, outputTokens: entry.usage.output_tokens,
      cachedInputTokens: entry.usage.input_tokens_details.cached_tokens ?? 0,
      cacheWriteTokens: entry.usage.input_tokens_details.cache_write_tokens ?? 0 }, readPricing());
  } catch (error) {
    delete entry.output;
    entry.failure = fallbackReason(error);
    entry.errorClass = error.constructor?.name;
    entry.httpStatus = Number.isInteger(error.status) ? error.status : null;
  }
  entry.latencyMs = Math.round(performance.now() - started);
  results.push(entry);
  console.log(JSON.stringify(entry));
  mkdirSync('../build', { recursive: true });
  writeFileSync('../build/cost-sol-diagnostic.json', JSON.stringify(results, null, 2));
  return entry;
}
const minimal = await probe('minimal', false);
if (minimal.failure || !minimal.usage) throw Error('SOL_STEP1_FAILED');
const structured = await probe('structured', true);
if (structured.failure || !structured.usage) throw Error('SOL_STEP2_FAILED');
return results;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await runRealPreflight();
  await runSolDiagnostic();
}
