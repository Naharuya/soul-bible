import OpenAI from 'openai';
import { getEncoding } from 'js-tiktoken';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConversationService } from '../src/conversation_service.js';
import { createOpenAiService } from '../src/openai_service.js';
import { routeCostRequest } from '../src/cost/model_router.js';
import { readPricing, estimateCost } from '../src/cost/model_pricing.js';
import { responseSchema } from '../src/schema.js';
import { assessRequestCrisis } from '../src/crisis.js';
import { safetyPreflight } from './cost_safety_preflight.js';

const encoding = getEncoding('o200k_base');
const count = value => value == null || value === '' ? 0 : encoding.encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
export function promptSegments(task) {
  const input = typeof task.input === 'string' ? JSON.parse(task.input) : task.input;
  const { memorySummary, recentTurns, sourceContext, userMessage, ...other } = input || {};
  return { method: 'o200k_base estimate; not provider-attributed segment counts',
    systemPromptTokens: count(task.instructions), outputSchemaTokens: count(task.jsonSchema),
    memoryTokens: count(memorySummary) + count(recentTurns?.length ? recentTurns : null),
    ragContextTokens: count(sourceContext?.length ? sourceContext : null), userTokens: count(userMessage),
    otherContextTokens: count(other), serializedInputTokens: count(input),
    maxOutputTokens: task.maxOutputTokens };
}
export function numericUsage(usage) {
  if (!usage) return null;
  const number = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return { input_tokens: number(usage.input_tokens), output_tokens: number(usage.output_tokens), total_tokens: number(usage.total_tokens),
    input_tokens_details: { cached_tokens: number(usage.input_tokens_details?.cached_tokens), cache_write_tokens: number(usage.input_tokens_details?.cache_write_tokens) },
    output_tokens_details: { reasoning_tokens: number(usage.output_tokens_details?.reasoning_tokens) } };
}
export function nearestRank(values, p) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null; }

export async function runRealBenchmark() {
  await safetyPreflight();
  const env = { ...process.env, SOUL_COST_ROUTER_V1_ENABLED: 'true' };
  if (!env.OPENAI_API_KEY) throw Error('REAL requires a configured API key (value suppressed).');
  // Added after the recorded REAL failure: do not pay for another benchmark
  // while this known safety regression remains unresolved.
  if (assessRequestCrisis({ userMessage: '지금 자해할 생각과 계획이 있습니다.', session: {} }).level === 0) {
    throw Error('REAL blocked by known Safety regression; no paid calls made. See docs/AI_COST_ROUTER_V1_REAL_2026-09-12.md.');
  }
  const pricing = readPricing(env);
  const requests = []; const sessions = []; let active; const pending = new Set();
  const service = createConversationService({ env, logger: { info(event, data) {
    if (event === 'conversation_result' && active) active.event = data;
  }, warn() {}, error() {} }, openAiFactory: options => {
    const api = new OpenAI({ ...options, timeout: options.timeout ?? 6000, baseURL: 'https://api.openai.com/v1', logLevel: 'off' });
    return { runStructured(task, config) {
      const call = { model: options.model, taskName: task.name, segments: promptSegments(task), actualProviderUsage: null,
        providerStatus: null, providerError: null, estimatedCostUsd: null };
      active.calls.push(call);
      const client = { responses: { async create(payload, requestOptions) {
        const start = performance.now();
        try {
          const response = await api.responses.create(payload, requestOptions);
          call.actualProviderUsage = numericUsage(response.usage);
          call.providerStatus = response.status;
          call.incompleteReason = response.incomplete_details?.reason ?? null;
          const u = call.actualProviderUsage;
          if (u?.input_tokens !== null && u?.output_tokens !== null && u) call.estimatedCostUsd = estimateCost({ model: options.model,
            inputTokens: u.input_tokens, cachedInputTokens: u.input_tokens_details.cached_tokens ?? 0,
            cacheWriteTokens: u.input_tokens_details.cache_write_tokens ?? 0, outputTokens: u.output_tokens }, pricing);
          return response;
        } catch (error) {
          // Never serialize API errors/messages/headers: authentication errors can contain keys.
          call.providerError = { status: Number.isInteger(error.status) ? error.status : null,
            type: /^[A-Za-z]+$/.test(error.name || '') ? error.name : 'Error',
            constructor: /^[A-Za-z]+$/.test(error.constructor?.name || '') ? error.constructor.name : 'Error',
            code: /^[a-z_]+$/.test(error.code || '') ? error.code : null };
          throw error;
        } finally { call.latencyMs = Math.round(performance.now() - start); }
      } } };
      const promise = createOpenAiService({ ...options, client }).runStructured(task, config);
      pending.add(promise); promise.then(() => pending.delete(promise), () => pending.delete(promise));
      return promise;
    } };
  } });
  async function session(name, turns, { purpose = 'main', religion } = {}) {
    let memory = ''; let previousQuestion = null; let previousAnswer = null;
    const identity = { userId: `real-benchmark-${name}`, plan: 'premium' };
    for (const [turnCount, userMessage] of turns.entries()) {
      const body = { session: { sessionId: name, selectedEmotion: '불안', emotionIntensity: 6, turnCount,
        conversationMemory: memory, previousAssistantQuestion: previousQuestion, previousUserAnswer: previousAnswer },
      userMessage, systemPromptVersion: 'ko-v1', allowedVerseIds: [], ...(religion ? { religion } : {}) };
      const route = routeCostRequest(body, env);
      const entry = { session: name, purpose, turn: turnCount + 1, fixture: userMessage, taskType: route.taskType,
        selectedTier: route.tier, selectedModel: route.model, calls: [] };
      active = entry;
      const start = performance.now();
      const result = responseSchema.parse(await service(body, undefined, memory, identity));
      await Promise.allSettled([...pending]);
      const event = entry.event || {}; delete entry.event;
      Object.assign(entry, { actualTier: event.tier, provider: event.provider, model: event.model,
        modelCalls: event.modelCalls ?? 0, inputTokens: event.modelCalls && entry.calls.some(c => !c.actualProviderUsage) ? null : event.inputTokens ?? 0,
        cachedInputTokens: event.cachedInputTokens ?? 0, outputTokens: event.modelCalls && entry.calls.some(c => !c.actualProviderUsage) ? null : event.outputTokens ?? 0,
        estimatedCostUsd: event.estimatedCostUsd ?? (entry.calls.length ? null : 0), latencyMs: Math.round(performance.now() - start),
        fallback: Boolean(event.fallback), fallbackReason: event.fallbackReason ?? null,
        knowledgeSearchCount: event.knowledgeSearchCount ?? 0, sourceIds: event.selectedSourceIds ?? [],
        citationValidation: event.citationValidationResult ?? 'not_run', retrievalConfidence: event.retrievalConfidence ?? null,
        schemaValid: true, riskLevel: result.riskLevel, stage: result.stage,
        syntheticResponse: { message: result.message, question: result.question, integratedInsight: result.integratedInsight, clinicalReflection: result.clinicalReflection } });
      requests.push(entry); memory = result.memorySummary; previousQuestion = result.question; previousAnswer = userMessage;
      console.log(JSON.stringify({ progress: name, turn: entry.turn, selectedTier: entry.selectedTier, model: entry.model,
        modelCalls: entry.modelCalls, costUsd: entry.estimatedCostUsd, fallback: entry.fallback, reason: entry.fallbackReason }));
    }
    const summary = { name, purpose, messages: turns.length, ...service.usageLedger.sessionSummary({ ...identity, sessionId: name }) };
    sessions.push(summary); return summary;
  }
  await session('simple', ['오늘 피곤해요', '마음이 좀 답답해요', '불안해요']);
  await session('complex', ['가족과 직장에서 동시에 갈등이 있어요', '하지만 관계를 포기하기도 어려워요', '반복되는 불안과 관계 문제를 상담하고 싶어요']);
  await session('rag', ['불안할 때 기도하고 싶어요', '마음이 지칠 때 기도로 위로받고 싶어요', '오늘도 신앙 안에서 작은 쉼을 갖고 싶어요'], { religion: 'protestant' });
  await session('crisis_control', ['지금 자해할 생각과 계획이 있습니다.'], { purpose: 'safety_control' });
  // Measure cold-start policy before any eligibility preparation.
  const theology = '신정론과 자유의지 관점에서 고난을 어떻게 이해할 수 있나요? 성경의 근거와 해석의 한계를 구분해 설명해 주세요.';
  await session('sol_cold_gate', [theology], { purpose: 'policy_control', religion: 'protestant' });
  // The measured chain uses Luna psychology + ONE Sol religion call. The
  // request gate needs 19 prior AI requests; do not prepare for two Sol calls.
  // These are REAL paid calls, not fabricated history, and excluded from the main mean.
  for (let i = 0; i < 20 && service.usageLedger.overview().today.aiRequests < 19; i++) {
    if (requests.filter(r => r.fallback && r.purpose !== 'policy_control').length >= 3 || service.usageLedger.overview().today.knownCostUsd > 0.10) break;
    await session(`cache_warmup_${i + 1}`, ['오늘 피곤해요'], { purpose: 'eligibility_and_cache_control' });
  }
  await session('sol', [theology, '그 관점을 일상에서 되새기고 싶어요', '오늘은 잠시 생각할 시간을 가져볼게요'], { religion: 'protestant' });
  const main = sessions.filter(s => s.purpose === 'main'); const mainRequests = requests.filter(r => r.purpose === 'main');
  const known = main.every(s => s.sessionEstimatedCostUsd !== null);
  const totalInput = main.reduce((s, r) => s + r.sessionInputTokens, 0); const cached = main.reduce((s, r) => s + r.sessionCachedTokens, 0);
  const costs = main.map(s => s.sessionEstimatedCostUsd);
  const report = { stage: 'REAL', generatedAt: new Date().toISOString(), sessionDefinition: '3 scripted messages; not observed completed production journeys',
    productionPolicyChanged: false, corpusMode: env.NODE_ENV === 'production' || env.SOUL_CORPUS_MODE === 'production' ? 'production' : 'development',
    externalEmbeddingConfigured: env.SOUL_EMBEDDING_PROVIDER === 'openai', pricing, requests, sessions,
    summary: { averageCostUsd: known ? costs.reduce((s, n) => s + n, 0) / main.length : null,
      p50SessionCostUsd: known ? nearestRank(costs, 0.5) : null, p90SessionCostUsd: known ? nearestRank(costs, 0.9) : null,
      p50RequestLatencyMs: nearestRank(mainRequests.map(r => r.latencyMs), 0.5), p90RequestLatencyMs: nearestRank(mainRequests.map(r => r.latencyMs), 0.9),
      cacheHitRate: totalInput ? cached / totalInput : null, cacheRateScope: 'received usage only; calls with missing usage excluded',
      usageComplete: mainRequests.every(r => r.calls.every(c => c.actualProviderUsage)),
      fallbackRate: mainRequests.filter(r => r.fallback).length / mainRequests.length,
      auxiliaryCalls: requests.filter(r => r.purpose !== 'main').reduce((sum, r) => sum + r.modelCalls, 0),
      totalRunEstimatedUsd: service.usageLedger.overview().today.estimatedCostUsd,
      targetUsd: 0.007, productionPopulationVerified: false },
    quality: { manualReviewRequired: true, crisisZeroCalls: requests.filter(r => r.purpose === 'safety_control').every(r => r.modelCalls === 0 && r.stage === 'crisis'),
      simpleAtMostOneCall: mainRequests.filter(r => r.session === 'simple').every(r => r.modelCalls <= 1),
      citationRejected: mainRequests.some(r => r.citationValidation === 'rejected') } };
  const serialized = JSON.stringify(report, null, 2);
  if (serialized.includes(env.OPENAI_API_KEY)) throw Error('Secret detected; report suppressed.');
  const directory = resolve('../build'); mkdirSync(directory, { recursive: true });
  const filename = resolve(directory, 'cost-v1-real-report.json'); writeFileSync(filename, serialized);
  console.log(JSON.stringify({ report: filename, sessions: main, summary: report.summary, quality: report.quality }, null, 2));
  if (!known || report.summary.fallbackRate || !report.quality.crisisZeroCalls || !report.quality.simpleAtMostOneCall) process.exitCode = 1;
}
