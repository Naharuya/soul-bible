import { requestSchema, responseSchema } from '../schema.js';
import { routeAgent } from '../ai_router.js';
import { assessSafety } from './safety_agent.js';
import { createPsychologyAgent } from './psychology_agent.js';
import { routeReligion, resolveReligion, comparisonTraditions } from './religion_router.js';
import { reviewReligiousIntegrity, reviewPsychologyIntegrity } from './religious_integrity_agent.js';
import { integrateResponse } from './response_integrator.js';
import { createLocalConversationService } from '../local_conversation_service.js';
import { createReligionKnowledgeProvider } from '../knowledge/provider.js';
import { buildSourceContext } from '../knowledge/source_context_builder.js';
import { validateCitations } from './citation_validator.js';
import { calculateRetrievalConfidence, applyRetrievalConfidence, explainRetrievalConfidence, noAnswerReligion } from '../knowledge/retrieval_confidence.js';
import { toLegacyReligion } from './specialist_result.js';
import { inferTraditionBranch } from '../knowledge/query_normalization.js';

export function normalizeContext(request, memorySummary) {
  const body = requestSchema.parse(request);
  return {
    sessionId: body.session.sessionId, locale: body.locale,
    // TODO: Replace the legacy default when Flutter exposes religion selection.
    religion: body.religion ?? 'protestant',
    emotion: body.session.selectedEmotion, intensity: body.session.emotionIntensity,
    ...(body.session.customEmotion ? { customEmotion: body.session.customEmotion } : {}),
    userMessage: body.userMessage, allowedVerseIds: body.allowedVerseIds,
    conversationState: body.session,
    memorySummary: memorySummary || body.session.conversationSummary || '',
  };
}

export function createConversationOrchestrator({ runStructured, selectReligion = routeReligion, logger = console,
  knowledgeProvider = createReligionKnowledgeProvider(), onRetrieval = () => {}, corpusMode = 'development' } = {}) {
  const local = createLocalConversationService();
  // Phase 1 has no provider, credentials or environment-driven activation.
  // Phase 2 injects the existing provider only through the feature-gated factory.
  const reflect = runStructured ? createPsychologyAgent({ runStructured }) : null;
  async function generate(request, agent, memorySummary = '', { signal } = {}) {
    const context = normalizeContext(request, memorySummary);
    const safety = assessSafety(context);
    if (safety) return responseSchema.parse(safety);
    signal?.throwIfAborted();
    if (!reflect) {
      // Resolve the future specialist only after safety; do not generate content yet.
      try {
        selectReligion(context.religion);
      } catch {
        try { logger.warn?.('conversation_fallback', { reason: 'religion_routing', mode: 'local' }); }
        catch { /* A logging failure must not prevent local fallback. */ }
      }
      const legacyAgent = agent ?? routeAgent({ requestedAgent: request.agentMode,
        userMessage: context.userMessage, verseLanguage: request.verseLanguage });
      // Keep the original input and memory argument: normalization must not change
      // any local response, including explicit religion values during this phase.
      return responseSchema.parse(await local(request, legacyAgent, memorySummary));
    }
    const reflection = await reflect(context, { signal });
    signal?.throwIfAborted();
    const routing = resolveReligion({ religion: request.religion, userMessage: context.userMessage });
    context.religion = routing.tradition;
    const psychology = reviewPsychologyIntegrity(reflection, { religion: context.religion });
    const observe = update => { try { onRetrieval(update); } catch { /* Telemetry is optional. */ } };
    observe({ routedTradition: routing.tradition });
    signal?.throwIfAborted();
    const comparison = comparisonTraditions({ religion: request.religion, userMessage: context.userMessage });
    if (routing.reason === 'ambiguous' && !comparison.length) {
      return integrateResponse({ context, psychology, religion: {
        perspective: '여러 전통이 언급되어 하나의 교리로 합치지 않고 관점을 먼저 확인하고 싶습니다.',
        guidance: '지금 필요한 돌봄을 먼저 살펴보셔도 괜찮습니다.',
        reflectionQuestion: '어느 전통의 관점에서 이야기하고 싶으신가요?', sourceRefs: [], cautions: [],
      }, agent: agent ?? routeAgent({ requestedAgent: request.agentMode, userMessage: context.userMessage, verseLanguage: request.verseLanguage }) });
    }
    let searchCount = 0;
    const sourceIds = [];
    const retrievalByTradition = {};
    async function runTradition(tradition) {
      signal?.throwIfAborted();
      let specialist;
      try {
        specialist = selectReligion(tradition);
        if (typeof specialist?.generate !== 'function') throw new Error('Missing specialist.');
        if (specialist.id !== tradition) throw new Error('Specialist tradition mismatch.');
      } catch {
        const error = new Error('Religion routing failed.');
        error.code = 'RELIGION_ROUTING';
        throw error;
      }
      // Never accept sourceContext from the public request or treat allowedVerseIds as sources.
      const search = { tradition, query: context.userMessage, language: context.locale, limit: 3 };
      if (corpusMode === 'production') search.traditionBranch = inferTraditionBranch(context.userMessage, tradition);
      observe({ knowledgeSearchCount: ++searchCount });
      let sourceContext;
      let found;
      try {
        found = await knowledgeProvider.search(search, { signal });
        signal?.throwIfAborted();
        sourceContext = buildSourceContext(found, search, { mode: corpusMode });
      } catch (cause) {
        signal?.throwIfAborted();
        const error = new Error('Knowledge retrieval failed.');
        error.code = 'KNOWLEDGE_RETRIEVAL';
        throw error;
      }
      sourceIds.push(...sourceContext.map(source => source.id));
      const top = found.diagnostics?.scores?.[0];
      const metrics = {
        retrievalMode: found.diagnostics?.retrievalMode ?? 'keyword',
        keywordScore: top?.keywordScore ?? 0, vectorScore: top?.vectorScore ?? 0, rerankScore: top?.rerankScore ?? 0,
        topSourceAuthority: sourceContext[0]?.authorityLevel ?? null,
        retrievalFallbackReason: found.diagnostics?.fallbackReason ?? null,
      };
      const initialConfidence = calculateRetrievalConfidence({ sources: sourceContext, tradition, traditionBranch: search.traditionBranch, topScore: metrics.rerankScore,
        secondScore: found.diagnostics?.scores?.[1]?.rerankScore ?? 0, ambiguous: routing.reason === 'legacy_default' });
      observe({ selectedSourceIds: [...sourceIds], ...metrics });
      const draft = corpusMode === 'production' && initialConfidence < 0.4 ? noAnswerReligion() : await (specialist.generateResult ?? specialist.generate).call(specialist, {
        userMessage: context.userMessage, emotion: context.emotion, intensity: context.intensity,
        locale: context.locale, psychology, conversationState: context.conversationState, sourceContext, retrievalConfidence: initialConfidence,
      }, runStructured, { signal });
      signal?.throwIfAborted();
      let citation;
      try {
        citation = validateCitations(draft, { tradition, sourceContext });
        observe({ citationValidationResult: citation.status });
      } catch (error) {
        observe({ citationValidationResult: 'rejected' });
        throw error;
      }
      // Citation repair must not launder an existing safety/doctrinal violation.
      if (citation.status === 'repaired') reviewReligiousIntegrity(draft, { religionAgent: specialist, sourceContext });
      const reviewed = reviewReligiousIntegrity(citation.output, { religionAgent: specialist, sourceContext });
      const citationConfidenceStatus = citation.status === 'passed' && !toLegacyReligion(reviewed).sourceRefs.length ? 'not_run' : citation.status;
      const confidenceDebug = explainRetrievalConfidence({ sources: sourceContext, tradition, traditionBranch: search.traditionBranch, topScore: metrics.rerankScore,
        secondScore: found.diagnostics?.scores?.[1]?.rerankScore ?? 0,
        citationResult: citationConfidenceStatus, ambiguous: routing.reason === 'legacy_default' });
      const retrievalConfidence = confidenceDebug.score;
      const religion = applyRetrievalConfidence(reviewed, retrievalConfidence);
      reviewReligiousIntegrity(religion, { religionAgent: specialist, sourceContext });
      retrievalByTradition[tradition] = { ...metrics, retrievalConfidence, selectedSourceIds: sourceContext.map(source => source.id), citationValidationResult: citation.status };
      observe({ retrievalConfidence, confidenceDebug, retrievalByTradition: structuredClone(retrievalByTradition) });
      return { religion, specialist };
    }
    if (comparison.length) {
      const separate = [];
      for (const tradition of comparison) {
        reviewPsychologyIntegrity(psychology, { religion: tradition });
        separate.push(await runTradition(tradition));
      }
      // Each specialist and citation review stays isolated; only checked text meets at integration.
      const result = integrateResponse({ context, psychology, religion: {
        perspective: '각 전통의 관점을 구분하여 살펴보겠습니다.', guidance: '필요한 돌봄을 먼저 선택하셔도 좋습니다.',
        reflectionQuestion: '어느 관점을 더 살펴보고 싶으신가요?', sourceRefs: [], cautions: [],
      }, agent: agent ?? routeAgent({ requestedAgent: request.agentMode, userMessage: context.userMessage, verseLanguage: request.verseLanguage }) });
      const summaries = separate.map(({ religion, specialist }) => {
        const text = toLegacyReligion(religion);
        // At most 3 sections; do not truncate a safety qualification mid-sentence.
        const section = `${text.perspective}\n${text.guidance}\n${text.cautions.join(' ')}`.trim();
        return `[${specialist.label}]\n${section.length <= 270 ? section : '확인된 근거의 범위가 제한적입니다. 이 전통의 자료를 따로 확인해 보시는 것이 좋겠습니다.'}`;
      });
      result.message = [psychology.emotionSummary, ...summaries].join('\n\n');
      return responseSchema.parse(result);
    }
    const { religion } = await runTradition(context.religion);
    const result = integrateResponse({ context, psychology, religion,
      agent: agent ?? routeAgent({ requestedAgent: request.agentMode, userMessage: context.userMessage, verseLanguage: request.verseLanguage }),
    });
    // app.js persists memorySummary only after final validation. Keep one store owner.
    return responseSchema.parse(result);
  }
  generate.mode = reflect ? 'multi-agent conversation' : 'local conversation';
  return generate;
}
