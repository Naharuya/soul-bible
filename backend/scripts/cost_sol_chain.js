import OpenAI from 'openai';
import { writeFileSync } from 'node:fs';
import { safetyPreflight } from './cost_safety_preflight.js';
import { createConversationOrchestrator } from '../src/agents/conversation_orchestrator.js';
import { createOpenAiService } from '../src/openai_service.js';
import { fallbackReason } from '../src/conversation_service.js';
import { compactModelInput, COST_PREFIX } from '../src/cost/prompt_context.js';
import { modelForCostTier } from '../src/cost/model_router.js';
import { religionJsonSchema } from '../src/agents/agent_contracts.js';
import { numericUsage, promptSegments } from './cost_router_real.js';
import { estimateCost, readPricing } from '../src/cost/model_pricing.js';
import { pathToFileURL } from 'node:url';
import { runRealPreflight } from './cost_real_preflight.js';

export async function runSolChain() {
await safetyPreflight();
const records = [];
async function run(task, timeoutMs, options = {}) {
  const religion = task.name.startsWith('religion_');
  const model = modelForCostTier(religion ? 'premium' : 'cheap', process.env);
  const api = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: timeoutMs, maxRetries: 0,
    baseURL: 'https://api.openai.com/v1', logLevel: 'off' });
  const row = { name: task.name, model, timeoutMs, segments: promptSegments(task), usage: null, estimatedCostUsd: null };
  const start = performance.now();
  try {
    const client = { responses: { async create(payload, opts) {
      const result = await api.responses.create(payload, opts);
      row.usage = numericUsage(result.usage); row.status = result.status;
      row.providerSuccess = result.status === 'completed';
      if (row.usage?.input_tokens != null && row.usage?.output_tokens != null) row.estimatedCostUsd = estimateCost({ model,
        inputTokens: row.usage.input_tokens, outputTokens: row.usage.output_tokens,
        cachedInputTokens: row.usage.input_tokens_details.cached_tokens ?? 0,
        cacheWriteTokens: row.usage.input_tokens_details.cache_write_tokens ?? 0 }, readPricing());
      return result;
    } } };
    return await createOpenAiService({ apiKey: process.env.OPENAI_API_KEY, model, client }).runStructured(task, options);
  } catch (error) { row.failure = fallbackReason(error); row.errorClass = error.constructor?.name; throw error;
  } finally { row.latencyMs = Math.round(performance.now() - start); records.push(row); console.log(JSON.stringify(row)); }
}
const generate = createConversationOrchestrator({ strictEvidence: true, logger: { warn() {} }, runStructured: async (original, options) => {
  const task = { ...original, input: compactModelInput(original.input),
    instructions: original.costInstructions ?? COST_PREFIX + original.instructions, costOptimized: true,
    maxOutputTokens: original.name.startsWith('religion_') ? 600 : 220,
    ...(original.name.startsWith('religion_') ? { jsonSchema: religionJsonSchema } : {}) };
  return run(task, original.name.startsWith('religion_') ? 12000 : 6000, options);
} });
try {
  await generate({ session: { sessionId: 'sol-chain-diagnostic', selectedEmotion: '불안', emotionIntensity: 6, turnCount: 0 },
    userMessage: '신정론과 자유의지 관점에서 고난을 어떻게 이해할 수 있나요? 성경의 근거와 해석의 한계를 구분해 설명해 주세요.',
    systemPromptVersion: 'ko-v1', allowedVerseIds: [], religion: 'protestant' }, undefined, '', { signal: AbortSignal.timeout(18000) });
} finally {
writeFileSync('../build/cost-sol-chain-diagnostic.json', JSON.stringify(records, null, 2));
}
if (records.length !== 2 || records.some(row => row.failure || !row.usage)) throw Error('SOL_STEP3_FAILED');
return records;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await runRealPreflight();
  await runSolChain();
}
