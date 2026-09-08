import { z } from 'zod';
import { religionIds, religionOutputSchema } from '../agents/agent_contracts.js';
import { validateGoldSplit } from './gold_benchmark.js';
import { createReligionKnowledgeProvider } from '../knowledge/provider.js';
import { createRetrievalStrategy } from '../knowledge/retrieval_strategy.js';
import { buildSourceContext } from '../knowledge/source_context_builder.js';
import { validateCitations } from '../agents/citation_validator.js';
import { reviewReligiousIntegrity } from '../agents/religious_integrity_agent.js';
import { citationPayload, approvedCorpus } from '../knowledge/expert_corpus.js';
import { contentChecksum } from '../knowledge/production_guard.js';
import { validateExpertRegistry, pilotStatus } from '../knowledge/expert_registry.js';
import { retrievalMetrics } from './metrics.js';
import { assessSafety } from '../agents/safety_agent.js';

export const responseDimensions = ['religiousAccuracy', 'traditionIntegrity', 'citationFaithfulness', 'psychologicalSafety', 'tone', 'usefulness', 'hallucination'];
export function humanResponseTemplate() {
  return { version: 'human-response-v1', scale: '1=unacceptable, 5=excellent; hallucination: 1=severe, 5=none',
    requiredBinding: ['questionId', 'strategy', 'tradition', 'corpusFingerprint', 'questionFingerprint', 'answer', 'model', 'generatedAt'],
    reviewer: null, reviewedAt: null,
    scores: Object.fromEntries(responseDimensions.map(key => [key, { score: null, reviewerNotes: '' }])) };
}
const answerSchema = z.object({ questionId: z.string().min(1), strategy: z.enum(['keyword', 'vector', 'hybrid']),
  corpusFingerprint: z.string().length(64), questionFingerprint: z.string().length(64),
  model: z.string().min(1), generatedAt: z.string().datetime(), output: religionOutputSchema, noAnswer: z.boolean(),
}).strict();
export const questionFingerprint = question => contentChecksum(JSON.stringify(question));
export const pilotCorpusFingerprint = records => contentChecksum(JSON.stringify(records));

export async function evaluatePilot({ registry: input, roster, questions, answers = [] }) {
  const registry = validateExpertRegistry(input, roster);
  validateGoldSplit(questions);
  const parsedAnswers = z.array(answerSchema).parse(answers);
  if (new Set(parsedAnswers.map(row => `${row.strategy}:${row.questionId}`)).size !== parsedAnswers.length) throw new Error('Duplicate model answer.');
  const report = { environment: registry.environment, actualCorpusApproval: 'BLOCKED_EXTERNAL_REVIEW',
    modelExecution: 'NOT_RUN_BY_THIS_EVALUATOR', traditions: {}, humanReviews: [] };
  for (const tradition of religionIds) {
    const state = pilotStatus(registry, roster).find(row => row.tradition === tradition);
    if (state.status === 'BLOCKED_EXTERNAL_REVIEW') {
      report.traditions[tradition] = { ...state, approvedChunks: 0, metrics: null, strategies: { keyword: null, vector: null, hybrid: null } }; continue;
    }
    const records = approvedCorpus(registry, roster, tradition);
    const fingerprint = pilotCorpusFingerprint(records);
    const evaluation = questions.filter(q => q.tradition === tradition && q.split === 'evaluation' && !assessSafety({ userMessage: q.question, emotion: '불안' }));
    const ids = new Set(records.map(record => record.sourceId));
    if (!evaluation.length || evaluation.some(q => q.expectedSourceCriteria.ids.some(id => !ids.has(id))
        || (!q.expectedSourceCriteria.allowEmpty && !q.expectedSourceCriteria.ids.length))) {
      report.traditions[tradition] = { status: 'BLOCKED_GOLD_LABELS', approvedChunks: records.length, corpusFingerprint: fingerprint, metrics: null }; continue;
    }
    const result = { status: 'EVALUATED', approvedChunks: records.length, corpusFingerprint: fingerprint,
      expertGoldApproved: evaluation.every(q => q.labelStatus === 'expert_approved'), strategies: {} };
    for (const strategy of ['keyword', 'vector', 'hybrid']) {
      const provider = createReligionKnowledgeProvider({ mode: 'production', store: { load: async () => records }, retriever: createRetrievalStrategy({ strategy }) });
      const rows = [], emotionalQueries = []; let answered = 0, citations = 0, citationPasses = 0, abstentions = 0, integrityPasses = 0, citationCompliant = 0;
      for (const question of evaluation) {
        const request = { tradition, query: question.question, language: question.expectedSourceCriteria.language ?? 'ko-KR',
          ...(question.expectedSourceCriteria.traditionBranch ? { traditionBranch: question.expectedSourceCriteria.traditionBranch } : {}), limit: 5 };
        const retrieved = await provider.search(request);
        const row = { questionId: question.id, expectedSourceIds: question.expectedSourceCriteria.ids, tradition, retrievedSources: retrieved.results };
        rows.push(row);
        if (question.expectedEmotionTags?.length || question.expectedConceptTags?.length) {
          const top = retrieved.results.slice(0, 3);
          const matching = top.filter(source => (question.expectedEmotionTags ?? []).some(tag => source.metadata.emotionTags?.includes(tag))
            || (question.expectedConceptTags ?? []).some(tag => source.metadata.conceptTags?.includes(tag)));
          emotionalQueries.push({ questionId: question.id, question: question.question,
            expectedEmotionTags: question.expectedEmotionTags ?? [], expectedConceptTags: question.expectedConceptTags ?? [],
            retrievedSourceIds: top.map(source => source.sourceId), tagAlignedAt3: matching.length / 3,
            empty: top.length === 0 });
        }
        const answer = parsedAnswers.find(value => value.questionId === question.id && value.strategy === strategy);
        let citationResult = 'not_run', integrityResult = 'not_run', payload = [];
        if (answer) {
          if (answer.corpusFingerprint !== fingerprint || answer.questionFingerprint !== questionFingerprint(question)
              || Date.parse(answer.generatedAt) > Date.now()) throw new Error('Stale model answer evidence.');
          answered++; if (answer.noAnswer) abstentions++;
          if (answer.output.sourceRefs.length) citations++;
          try {
            if (answer.noAnswer && answer.output.sourceRefs.length) throw new Error('Abstention cannot claim citations.');
            const context = buildSourceContext(retrieved, request, { mode: 'production' });
            const checked = validateCitations(answer.output, { tradition, sourceContext: context });
            citationResult = checked.status;
            if (checked.status === 'passed' && answer.output.sourceRefs.length) {
              payload = citationPayload(retrieved.results, answer.output.sourceRefs, tradition); citationPasses++;
            }
            reviewReligiousIntegrity(answer.output, { religionAgent: { id: tradition }, sourceContext: context });
            integrityResult = 'passed'; integrityPasses++;
            if (checked.status !== 'repaired' && (answer.noAnswer || (checked.status === 'passed' && answer.output.sourceRefs.length))) citationCompliant++;
          } catch { if (citationResult === 'not_run') citationResult = 'rejected'; integrityResult = 'rejected'; }
        }
        report.humanReviews.push({ questionId: question.id, strategy, tradition, question: question.question,
          corpusFingerprint: fingerprint, questionFingerprint: questionFingerprint(question),
          retrievedSources: retrieved.results.map(source => ({ sourceId: source.sourceId, text: source.text, reference: source.reference })),
          answer: answer?.output ?? null, model: answer?.model ?? null, generatedAt: answer?.generatedAt ?? null,
          citationPayload: payload, citationResult, integrityResult,
          reviewer: null, reviewedAt: null,
          scores: Object.fromEntries(responseDimensions.map(key => [key, { score: null, reviewerNotes: '' }])),
        });
      }
      const at1 = retrievalMetrics(rows, 1), at3 = retrievalMetrics(rows, 3), at5 = retrievalMetrics(rows, 5);
      result.strategies[strategy] = { recallAt1: at1.recallAtK, recallAt3: at3.recallAtK, recallAt5: at5.recallAtK,
        precisionAt3: at3.precisionAtK,
        emotionalQueries,
        mrr: at5.mrr, wrongTraditionRate: at5.wrongTraditionRetrievalRate, emptyRetrievalRate: at5.emptyRetrievalRate,
        citationPassRate: citations ? citationPasses / citations : null, noAnswerRate: answered ? abstentions / answered : null,
        citationAttempts: citations, answered, queries: rows.length, integrityPassRate: answered ? integrityPasses / answered : null,
        citationComplianceRate: answered ? citationCompliant / answered : null };
    }
    report.traditions[tradition] = result;
  }
  const used = new Set(report.humanReviews.filter(row => row.answer).map(row => `${row.strategy}:${row.questionId}`));
  if (parsedAnswers.some(row => !used.has(`${row.strategy}:${row.questionId}`))) throw new Error('Answer does not match an evaluated production question.');
  if (Object.values(report.traditions).some(row => row.status === 'EVALUATED' || row.status === 'BLOCKED_GOLD_LABELS')) report.actualCorpusApproval = 'PARTIAL_APPROVED_CORPUS';
  return report;
}

export function releaseDecision({ regression, readiness, pilot, criticalSafety, rollback, traditions, humanReviews = [] }) {
  const checks = { regressions: regression?.existingBaseline === 211 && Number.isInteger(regression.additionalTests)
      && regression.additionalTests >= 20 && regression.total === 211 + regression.additionalTests
      && regression.passed === regression.total && regression.failed === 0 && regression.skipped === 0,
    readiness: readiness?.status === 'READY', rollback: rollback?.passed === true,
    criticalSafety: criticalSafety?.status === 'PASS' && criticalSafety.total === 7 && criticalSafety.passed === 7 && criticalSafety.failed === 0,
    productionEvidence: pilot?.environment === 'production', corpus: true, retrieval: true, citations: true, humanReview: true };
  if (!Array.isArray(traditions) || !traditions.length || new Set(traditions).size !== traditions.length) checks.corpus = false;
  for (const tradition of traditions ?? []) {
    const evaluated = pilot?.traditions?.[tradition];
    if (!readiness?.scope?.includes(tradition) || evaluated?.status !== 'EVALUATED' || !evaluated.expertGoldApproved || !(evaluated.approvedChunks > 0)) checks.corpus = false;
    if (!evaluated?.corpusFingerprint || readiness?.activeIndexes?.[tradition]?.corpusFingerprint !== evaluated.corpusFingerprint) checks.corpus = false;
    // The release candidate uses keyword. Experimental modes are reported but do not replace its gate.
    const metrics = evaluated?.strategies?.keyword;
    if (!Number.isFinite(metrics?.wrongTraditionRate) || metrics.wrongTraditionRate !== 0) checks.retrieval = false;
    if (!(metrics?.queries > 0) || metrics.answered !== metrics.queries || !(metrics.citationAttempts > 0)
        || metrics.citationPassRate !== 1 || metrics.integrityPassRate !== 1 || metrics.citationComplianceRate !== 1) checks.citations = false;
    const expected = pilot?.humanReviews?.filter(row => row.tradition === tradition && row.strategy === 'keyword') ?? [];
    if (!expected.length || expected.some(row => {
      const reviewed = humanReviews.filter(value => value.questionId === row.questionId && value.strategy === row.strategy && value.tradition === row.tradition);
      if (reviewed.length !== 1) return true;
      const value = reviewed[0];
      return !value.reviewer?.trim() || !Number.isFinite(Date.parse(value.reviewedAt)) || Date.parse(value.reviewedAt) > Date.now()
        || value.corpusFingerprint !== row.corpusFingerprint || value.questionFingerprint !== row.questionFingerprint
        || value.model !== row.model || value.generatedAt !== row.generatedAt
        || JSON.stringify(value.answer) !== JSON.stringify(row.answer)
        || responseDimensions.some(key => !Number.isInteger(value.scores?.[key]?.score) || value.scores[key].score < 4 || value.scores[key].score > 5 || !value.scores[key].reviewerNotes?.trim());
    })) checks.humanReview = false;
  }
  return { status: Object.values(checks).every(Boolean) ? 'RELEASE_CANDIDATE' : 'BLOCKED_RELEASE',
    productionDefault: 'keyword', checks };
}
