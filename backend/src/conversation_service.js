import { ZodError } from 'zod';
import { createLocalConversationService } from './local_conversation_service.js';
import { createOpenAiService } from './openai_service.js';
import { requestSchema, responseSchema } from './schema.js';
import { routeAgent } from './ai_router.js';
import { createConversationOrchestrator, normalizeContext } from './agents/conversation_orchestrator.js';
import { assessSafety } from './agents/safety_agent.js';
import { resolveReligion } from './agents/religion_router.js';
import { createReligionKnowledgeProvider } from './knowledge/provider.js';
import { createHybridRetriever } from './knowledge/hybrid_retriever.js';
import { createOpenAiEmbeddingAdapter } from './knowledge/openai_embedding_adapter.js';
import { createRetrievalStrategy } from './knowledge/retrieval_strategy.js';
import { createProductionIndex, activeIndexStore } from './knowledge/production_index.js';
import { productionConfiguration } from './knowledge/production_readiness.js';
import { classifyTask, routeModel } from './cost/model_router.js';
import { createUsageLedger } from './cost/usage_ledger.js';
import { readPricing, estimateCost } from './cost/model_pricing.js';
import { createPsychologyAgent } from './agents/psychology_agent.js';
import { reviewPsychologyIntegrity } from './agents/religious_integrity_agent.js';
import { buildSourceContext } from './knowledge/source_context_builder.js';
import { calculateRetrievalConfidence } from './knowledge/retrieval_confidence.js';
import { keywordRetriever } from './knowledge/retriever.js';
import { inferTraditionBranch } from './knowledge/query_normalization.js';

function fallbackReason(error) {
  if (error?.code === 'COST_LEDGER') return 'cost_gate_error';
  if (error?.code === 'COST_BUDGET') return 'cost_budget';
  if (error?.code === 'KNOWLEDGE_RETRIEVAL') return 'knowledge_retrieval';
  if (error?.code === 'CONVERSATION_TIMEOUT' || error?.name === 'APIConnectionTimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (error?.code === 'RELIGIOUS_INTEGRITY') return 'religious_integrity';
  if (error?.code === 'RELIGION_ROUTING') return 'religion_routing';
  if (error?.status === 429) return 'rate_limit';
  if (error?.status >= 500 && error?.status <= 599) return 'provider_5xx';
  if (error?.status === 401 || error?.status === 403) return 'provider_auth';
  if (error?.name === 'APIConnectionError' || ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(error?.code)) return 'connection_failure';
  if (error instanceof SyntaxError) return 'malformed_json';
  if (error instanceof ZodError) return 'schema_validation';
  return 'agent_exception';
}

function logFallback(logger, reason) {
  // Do not log prompts, user text, keys, provider error messages or invalid output.
  try { logger.warn?.('conversation_fallback', { reason, mode: 'local' }); } catch { /* Logging must not prevent fallback. */ }
}

async function withDeadline(generate, body, agent, memorySummary, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => generate(body, agent, memorySummary, { signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Conversation deadline exceeded.');
          error.code = 'CONVERSATION_TIMEOUT';
          reject(error);
          controller.abort(error);
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function createConversationService({ env = process.env, logger = console,
  openAiFactory = createOpenAiService, timeoutMs = 18_000, selectReligion, knowledgeProvider,
  usageLedger = createUsageLedger({ env, pricing: readPricing(env) }), costKnowledgeProvider } = {}) {
  const local = createLocalConversationService();
  const apiKey = (env.OPENAI_API_KEY || '').trim();
  const configuration = productionConfiguration(env);
  const requestedOpenAi = env.SOUL_AI_MODE === 'openai' && env.SOUL_MULTI_AGENT_ENABLED === 'true';
  const enabled = requestedOpenAi && !configuration.externalApiDisabled && Boolean(apiKey) && !/\s/.test(apiKey);
  const corpusMode = env.NODE_ENV === 'production' || env.SOUL_CORPUS_MODE === 'production' ? 'production' : 'development';
  const selectedKnowledgeProvider = knowledgeProvider ?? createReligionKnowledgeProvider({
    mode: corpusMode,
    ...(corpusMode === 'production' && env.SOUL_PRODUCTION_INDEX_DIR
      ? { store: activeIndexStore(createProductionIndex(env.SOUL_PRODUCTION_INDEX_DIR)) } : {}),
    retriever: corpusMode === 'production' ? createRetrievalStrategy({ strategy: configuration.retrievalMode }) : createHybridRetriever(!configuration.externalApiDisabled && env.SOUL_EMBEDDING_PROVIDER === 'openai'
      ? { embeddingProvider: createOpenAiEmbeddingAdapter({ env }) } : {}),
  });
  // Keep the repository's existing model setting; deployment must verify account access.
  const pricing = readPricing(env);
  const deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 18_000) : 18_000;
  const providers = new Map();
  // The no-LLM path never activates an external embedding adapter.
  const cheapKnowledge = costKnowledgeProvider ?? createReligionKnowledgeProvider({ mode: corpusMode, retriever: keywordRetriever,
    ...(corpusMode === 'production' && env.SOUL_PRODUCTION_INDEX_DIR
      ? { store: activeIndexStore(createProductionIndex(env.SOUL_PRODUCTION_INDEX_DIR)) } : {}) });

  function getProvider(selectedModel) {
    // Cache only the client, never request-specific usage or conversation state.
    if (!providers.has(selectedModel)) providers.set(selectedModel,
      Promise.resolve().then(() => openAiFactory({ apiKey, model: selectedModel, maxRetries: 0 })).catch(error => {
        providers.delete(selectedModel); throw error;
      }));
    return providers.get(selectedModel);
  }

  async function fallback(body, agent, memorySummary, neutral = false) {
    const result = await local(body, agent, memorySummary);
    if (neutral || (body.religion && body.religion !== 'protestant')) {
      // Preserve legacy requests exactly, but never route another religion to Bible content.
      result.suggestedVerseId = null;
      result.shouldOfferVerse = false;
      result.integratedInsight = null;
      if (result.stage === 'verse_offer' || result.stage === 'action') {
        result.stage = 'action';
        result.message = '지금까지 나눈 마음을 돌아보며, 오늘 할 수 있는 작은 돌봄을 하나 정해 보세요.';
        result.question = '지금 자신을 위해 할 수 있는 작은 행동은 무엇일까요?';
      }
    }
    return responseSchema.parse(result);
  }

  async function generate(request, suppliedAgent, memorySummary = '', trustedIdentity = {}) {
    const started = performance.now();
    const usage = { modelCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    const usedModels = new Set();
    let lease; let selectedTier = 'local'; let actualModelTier = 'local';
    const retrieval = { routedTradition: null, knowledgeSearchCount: 0, selectedSourceIds: [], citationValidationResult: 'not_run' };
    Object.assign(retrieval, { retrievalMode: null, keywordScore: 0, vectorScore: 0, rerankScore: 0,
      topSourceAuthority: null, retrievalConfidence: 0, retrievalFallbackReason: null, retrievalByTradition: {} });
    function record(provider, reason = null, usedModel = false) {
      try { lease?.finish({ tier: provider === 'openai' ? actualModelTier : provider === 'rag' ? 'rag' : 'local',
        provider, fallback: reason !== null, fallbackReason: reason }); } catch { /* Accounting failures never break safe responses. */ }
      try {
        logger.info?.('conversation_result', {
          provider, model: usedModel && usedModels.size ? (usedModels.size === 1 ? [...usedModels][0] : 'multiple') : null,
          models: [...usedModels], tier: actualModelTier, gateTier: selectedTier,
          fallback: reason !== null, fallbackReason: reason,
          latencyMs: Math.round(performance.now() - started), ...usage, ...retrieval,
        });
      } catch { /* Telemetry must not affect conversation delivery. */ }
    }
    // Request errors must still reach app.js as HTTP 400, not be swallowed by fallback.
    const body = requestSchema.parse(request);
    const agent = suppliedAgent ?? routeAgent({ requestedAgent: body.agentMode, userMessage: body.userMessage, verseLanguage: body.verseLanguage });
    const safety = assessSafety(normalizeContext(body, memorySummary));
    if (safety) {
      try { lease = usageLedger.reserve({ sessionId: body.session.sessionId, taskType: 'crisis', agent: agent.id }); } catch { /* Safety bypass. */ }
      record('safety');
      return responseSchema.parse(safety);
    }
    const taskType = classifyTask(body);
    if (!enabled && !['bible_search', 'religion_search'].includes(taskType)) {
      try { lease = usageLedger.reserve({ sessionId: body.session.sessionId, taskType: 'rule', agent: agent.id }); } catch { /* Local remains available. */ }
      const result = await fallback(body, agent, memorySummary);
      record('local', requestedOpenAi ? 'missing_api_key' : null);
      return result;
    }
    try {
      // This fourth argument is server-internal; app.js never copies identity or
      // plan from the JSON payload or from the shared app bearer.
      lease = usageLedger.reserve({ userId: trustedIdentity.userId, plan: trustedIdentity.plan,
        sessionId: body.session.sessionId, taskType, agent: agent.id });
      selectedTier = lease.decision.tier;
    } catch {
      const result = await fallback(body, agent, memorySummary, resolveReligion(body).tradition !== 'protestant');
      record('local', 'cost_gate_error'); return result;
    }
    if (selectedTier === 'local' || selectedTier === 'blocked') {
      const result = await fallback(body, agent, memorySummary, resolveReligion(body).tradition !== 'protestant');
      record('local', lease.decision.reason === 'no_llm_required' ? null : lease.decision.reason); return result;
    }
    if (selectedTier === 'rag') {
      try {
        const result = await withDeadline(async (_body, _agent, _memory, { signal }) => {
          const routing = resolveReligion(body);
          if (!routing.tradition) throw Error('Ambiguous tradition.');
          const search = { tradition: routing.tradition, query: body.userMessage, language: body.locale, limit: 3,
            ...(corpusMode === 'production' ? { traditionBranch: inferTraditionBranch(body.userMessage, routing.tradition) } : {}) };
          const found = await cheapKnowledge.search(search, { signal });
          signal.throwIfAborted();
          const sources = buildSourceContext(found, search, { mode: corpusMode });
          const confidence = calculateRetrievalConfidence({ sources, tradition: routing.tradition,
            traditionBranch: search.traditionBranch, topScore: found.diagnostics?.scores?.[0]?.rerankScore ?? 0,
            secondScore: found.diagnostics?.scores?.[1]?.rerankScore ?? 0, ambiguous: routing.reason === 'legacy_default' });
          const source = sources.find(item => !item.metadata?.sample && item.text.length + item.reference.length < 1000);
          if (!source || confidence < 0.4) throw Error('Insufficient evidence.');
          const response = await fallback(body, agent, memorySummary, routing.tradition !== 'protestant');
          response.message = `관련 자료입니다.\n\n${source.reference}\n${source.text}`;
          response.suggestedVerseId = null; response.shouldOfferVerse = false;
          if (response.stage === 'verse_offer') response.stage = 'action';
          return responseSchema.parse(response);
        }, body, agent, memorySummary, deadline);
        record('rag'); return result;
      } catch {
        const result = await fallback(body, agent, memorySummary, resolveReligion(body).tradition !== 'protestant');
        record('local', 'rag_insufficient'); return result;
      }
    }
    try {
      const attempt = async (input, selectedAgent, memory, { signal }) => {
        let reservedUpperCost = 0;
        const runStructured = async (task, options) => {
          signal.throwIfAborted();
          let routed = routeModel({ taskType: task.name === 'psychology_reflection' ? 'emotion' : taskType, costTier: lease.capModelTier(selectedTier) }, env);
          // Bound priced calls conservatively by UTF-8 bytes plus schema/framing
          // allowance. Unknown pricing retains the full request reservation.
          const estimateUpper = model => estimateCost({ model,
            inputTokens: Buffer.byteLength(JSON.stringify(task), 'utf8') + 4096,
            outputTokens: task.maxOutputTokens ?? 1800 }, pricing);
          let upperCost = estimateUpper(routed.model);
          if (upperCost !== null && reservedUpperCost + upperCost > lease.decision.policy.reservationUsd) {
            const error = new Error('Cost reservation exceeded.'); error.code = 'COST_BUDGET'; throw error;
          }
          let provider = await getProvider(routed.model);
          signal.throwIfAborted();
          // Recheck after asynchronous client creation: another concurrent
          // request may have consumed the premium share in the meantime.
          if (routed.tier === 'premium' && lease.capModelTier('premium') !== 'premium') {
            routed = routeModel({ taskType, costTier: 'standard' }, env);
            upperCost = estimateUpper(routed.model);
            if (upperCost !== null && reservedUpperCost + upperCost > lease.decision.policy.reservationUsd) {
              const error = new Error('Cost reservation exceeded.'); error.code = 'COST_BUDGET'; throw error;
            }
            provider = await getProvider(routed.model);
            signal.throwIfAborted();
          }
          if (typeof provider?.runStructured !== 'function') throw new TypeError('Invalid provider interface.');
          let track;
          try { track = lease.recordCall({ model: routed.model, modelTier: routed.tier }); }
          catch (error) {
            if (error?.code !== 'COST_PREMIUM_SHARE') throw error;
            // A second server process can consume the last premium allowance
            // between the advisory read and the atomic call reservation.
            routed = routeModel({ taskType, costTier: 'standard' }, env);
            upperCost = estimateUpper(routed.model);
            if (upperCost !== null && reservedUpperCost + upperCost > lease.decision.policy.reservationUsd) {
              const budgetError = new Error('Cost reservation exceeded.'); budgetError.code = 'COST_BUDGET'; throw budgetError;
            }
            provider = await getProvider(routed.model);
            signal.throwIfAborted();
            if (typeof provider?.runStructured !== 'function') throw new TypeError('Invalid provider interface.');
            track = lease.recordCall({ model: routed.model, modelTier: routed.tier });
          }
          reservedUpperCost += upperCost ?? 0;
          if (['local', 'cheap', 'standard', 'premium'].indexOf(routed.tier)
            > ['local', 'cheap', 'standard', 'premium'].indexOf(actualModelTier)) actualModelTier = routed.tier;
          usedModels.add(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(routed.model) && !/^sk-/i.test(routed.model) ? routed.model : 'configured-model');
          usage.modelCalls++;
          return provider.runStructured(task, { ...options, onUsage: (counts) => {
            try { track(counts); } catch { /* Keep provider response usable. */ }
            for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens']) {
              if (Number.isSafeInteger(counts?.[key]) && counts[key] >= 0) usage[key] += counts[key];
            }
          } });
        };
        if (selectedTier === 'cheap') {
          const context = normalizeContext(input, memory);
          const routing = resolveReligion(input);
          const reflection = reviewPsychologyIntegrity(await createPsychologyAgent({ runStructured })(context, { signal }), { religion: routing.tradition });
          signal.throwIfAborted();
          const result = await fallback(input, selectedAgent, memory, routing.tradition !== 'protestant');
          result.message = reflection.emotionSummary;
          result.memorySummary = [memory, reflection.emotionSummary].filter(Boolean).join('\n').slice(-4000);
          return responseSchema.parse(result);
        }
        return createConversationOrchestrator({ runStructured, selectReligion, knowledgeProvider: selectedKnowledgeProvider, corpusMode,
          onRetrieval: update => { if (!signal.aborted) Object.assign(retrieval, update); },
        })(input, selectedAgent, memory, { signal });
      };
      const result = responseSchema.parse(await withDeadline(attempt, body, agent, memorySummary, deadline));
      record('openai', null, true);
      return result;
    } catch (error) {
      const reason = fallbackReason(error);
      logFallback(logger, reason);
      const routing = resolveReligion({ religion: body.religion, userMessage: body.userMessage });
      const result = await fallback(body, agent, memorySummary, routing.tradition !== 'protestant');
      record('local', reason, true);
      return result;
    }
  }
  generate.mode = enabled ? 'multi-agent conversation' : 'local conversation';
  generate.usageLedger = usageLedger;
  return generate;
}
