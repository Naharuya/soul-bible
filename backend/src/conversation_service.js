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

function fallbackReason(error) {
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
  openAiFactory = createOpenAiService, timeoutMs = 18_000, selectReligion, knowledgeProvider } = {}) {
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
  const model = env.OPENAI_MODEL || 'gpt-5.6';
  const deadline = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 18_000) : 18_000;
  const loggedModel = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(model) && !/^sk-/i.test(model) ? model : 'configured-model';
  let providerPromise;

  function getProvider() {
    // Cache only the client, never request-specific usage or conversation state.
    providerPromise ??= Promise.resolve().then(() => openAiFactory({ apiKey, model })).catch((error) => {
      providerPromise = undefined;
      throw error;
    });
    return providerPromise;
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

  async function generate(request, suppliedAgent, memorySummary = '') {
    const started = performance.now();
    const usage = { modelCalls: 0, inputTokens: 0, outputTokens: 0 };
    const retrieval = { routedTradition: null, knowledgeSearchCount: 0, selectedSourceIds: [], citationValidationResult: 'not_run' };
    Object.assign(retrieval, { retrievalMode: null, keywordScore: 0, vectorScore: 0, rerankScore: 0,
      topSourceAuthority: null, retrievalConfidence: 0, retrievalFallbackReason: null, retrievalByTradition: {} });
    function record(provider, reason = null, usedModel = false) {
      try {
        logger.info?.('conversation_result', {
          provider, model: usedModel ? loggedModel : null,
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
      record('safety');
      return responseSchema.parse(safety);
    }
    if (!enabled) {
      const result = await fallback(body, agent, memorySummary);
      record('local', requestedOpenAi ? 'missing_api_key' : null);
      return result;
    }
    try {
      const attempt = async (input, selectedAgent, memory, { signal }) => {
        const provider = await getProvider();
        signal.throwIfAborted();
        if (typeof provider?.runStructured !== 'function') throw new TypeError('Invalid provider interface.');
        const runStructured = (task, options) => {
          signal.throwIfAborted();
          usage.modelCalls++;
          return provider.runStructured(task, { ...options, onUsage: (counts) => {
            if (signal.aborted) return;
            for (const key of ['inputTokens', 'outputTokens']) {
              if (Number.isSafeInteger(counts?.[key]) && counts[key] >= 0) usage[key] += counts[key];
            }
          } });
        };
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
  return generate;
}
