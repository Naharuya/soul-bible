import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createReligionKnowledgeProvider } from '../knowledge/provider.js';
import { createRetrievalStrategy } from '../knowledge/retrieval_strategy.js';
import { retrievalMetrics } from './metrics.js';
import { classifyRetrievalErrors } from './retrieval_errors.js';
import { assessSafety } from '../agents/safety_agent.js';
import { explainRetrievalConfidence } from '../knowledge/retrieval_confidence.js';

export function validateGoldSplit(questions) {
  const ids = new Set(); const prompts = new Set();
  for (const q of questions) {
    const key = `${q.tradition}:${q.question.normalize('NFKC').trim()}`;
    if (ids.has(q.id) || prompts.has(key) || !['development', 'evaluation'].includes(q.split)
        || !Array.isArray(q.expectedSourceCriteria?.ids) || !Array.isArray(q.expectedConcepts)
        || !q.mustNotRetrieve || !Array.isArray(q.mustNotContain) || !q.safetyExpectation || !q.citationExpectation) throw new Error('Invalid/overlapping Gold split.');
    ids.add(q.id); prompts.add(key);
  }
}
export async function benchmarkQuestions(questions, { strategy, weights, normalize = true }) {
  const provider = createReligionKnowledgeProvider({ retriever: createRetrievalStrategy({ strategy, weights, normalize }) });
  const rows = []; const reviews = []; let safetyIntercepts = 0;
  const errorCounts = Object.fromEntries(['WRONG_TRADITION', 'WRONG_BRANCH', 'LOW_SEMANTIC_MATCH', 'REFERENCE_MISS', 'AUTHORITY_MISMATCH', 'EMPTY_RESULT', 'DUPLICATE_RESULT', 'RANKING_FAILURE'].map(key => [key, 0]));
  for (const question of questions) {
    const safetyAnswer = assessSafety({ userMessage: question.question, emotion: '불안' });
    if (safetyAnswer) {
      safetyIntercepts++;
      reviews.push({ questionId: question.id, sourceId: null, tradition: question.tradition,
        sourceTitle: null, licenseStatus: null, reviewStatus: 'development', question: question.question,
        retrievedSources: [], answer: safetyAnswer, retrievalConfidence: null,
        citationResult: 'not_run', integrityResult: 'not_run', safetyResult: 'intercepted',
        reviewAccuracy: null, reviewTraditionIntegrity: null, reviewSafety: null, reviewCitation: null,
        reviewNotes: '', labelStatus: question.labelStatus });
      continue;
    }
    const found = await provider.search({ tradition: question.tradition, query: question.question,
      language: question.expectedSourceCriteria.language, traditionBranch: question.expectedSourceCriteria.traditionBranch, limit: 5 });
    const errors = classifyRetrievalErrors(question, found.results);
    errors.forEach(error => errorCounts[error]++);
    const confidence = explainRetrievalConfidence({ sources: found.results.map(source => ({ ...source, religion: source.tradition })),
      tradition: question.tradition, traditionBranch: question.expectedSourceCriteria.traditionBranch,
      topScore: found.diagnostics?.scores[0]?.rerankScore ?? 0, secondScore: found.diagnostics?.scores[1]?.rerankScore ?? 0 });
    const row = { questionId: question.id, question: question.question, tradition: question.tradition,
      expectedSourceIds: question.expectedSourceCriteria.ids, retrievedSources: found.results,
      errors, confidence, diagnostics: found.diagnostics };
    rows.push(row);
    reviews.push({ questionId: question.id, sourceId: found.results[0]?.sourceId ?? null, tradition: question.tradition,
      sourceTitle: found.results[0]?.title ?? null, licenseStatus: found.results[0]?.metadata.licenseStatus ?? 'self_authored',
      reviewStatus: found.results[0]?.metadata.reviewStatus ?? 'development', question: question.question,
      retrievedSources: found.results.map(({ sourceId, reference, tradition }) => ({ sourceId, reference, tradition })),
      answer: null, retrievalConfidence: confidence.score, citationResult: 'not_run', integrityResult: 'not_run', safetyResult: 'not_intercepted',
      reviewAccuracy: null, reviewTraditionIntegrity: null, reviewSafety: null, reviewCitation: null, reviewNotes: '', labelStatus: question.labelStatus });
  }
  const at1 = retrievalMetrics(rows, 1), at3 = retrievalMetrics(rows, 3), at5 = retrievalMetrics(rows, 5);
  return { metrics: { recallAt1: at1.recallAtK, recallAt3: at3.recallAtK, recallAt5: at5.recallAtK,
    precisionAt3: at3.precisionAtK, mrr: at5.mrr, wrongTraditionRate: at5.wrongTraditionRetrievalRate,
    emptyRetrievalRate: at5.emptyRetrievalRate, queries: rows.length, relevantQueries: at5.relevantQueries, safetyIntercepts }, errorCounts, rows, reviews };
}

export async function tuneDevelopment(questions, config) {
  if (!questions.length || questions.some(q => q.split !== 'development')) throw new Error('Tuning may use development questions only.');
  const trials = [];
  for (const keyword of config.keywordWeights) for (const authority of config.authorityWeights) for (const reference of config.referenceWeights) {
    const weights = { keyword, vector: 1 - keyword, authority, reference, branch: config.branchWeight, quality: config.qualityWeight, duplicate: config.duplicatePenalty };
    const result = await benchmarkQuestions(questions, { strategy: 'hybrid', weights });
    trials.push({ weights, metrics: result.metrics });
  }
  if (!trials.length) throw new Error('No tuning configurations.');
  trials.sort((a, b) => b.metrics.mrr - a.metrics.mrr || b.metrics.recallAt3 - a.metrics.recallAt3
    || a.metrics.wrongTraditionRate - b.metrics.wrongTraditionRate);
  return { selectedWeights: trials[0].weights, trials };
}

export function promotionDecision(keyword, hybrid, { expertReviewed = false } = {}) {
  const checks = { mrrNotWorse: hybrid.mrr >= keyword.mrr, recallNotWorse: hybrid.recallAt3 >= keyword.recallAt3,
    isolationNotWorse: hybrid.wrongTraditionRate <= keyword.wrongTraditionRate,
    measurableImprovement: hybrid.mrr > keyword.mrr || hybrid.recallAt3 > keyword.recallAt3,
    expertReviewed };
  return { promoted: Object.values(checks).every(Boolean), productionDefault: Object.values(checks).every(Boolean) ? 'hybrid' : 'keyword', checks };
}

export async function runGoldBenchmark() {
  const datasetBytes = await readFile(new URL('../../evaluation/gold-candidate-v1.json', import.meta.url));
  const questions = JSON.parse(datasetBytes);
  validateGoldSplit(questions);
  const config = JSON.parse(await readFile(new URL('../../config/retrieval-tuning.json', import.meta.url), 'utf8'));
  const development = questions.filter(q => q.split === 'development');
  const evaluation = questions.filter(q => q.split === 'evaluation');
  // Select once on development, then run the untouched evaluation split. Never rewrite runtime defaults.
  const tuning = await tuneDevelopment(development, config);
  const developmentResults = {};
  for (const strategy of ['keyword', 'vector', 'hybrid']) developmentResults[strategy] = await benchmarkQuestions(development, { strategy, weights: tuning.selectedWeights });
  const results = {};
  for (const strategy of ['keyword', 'vector', 'hybrid']) results[strategy] = await benchmarkQuestions(evaluation, { strategy, weights: tuning.selectedWeights });
  const decision = promotionDecision(results.keyword.metrics, results.hybrid.metrics, { expertReviewed: evaluation.every(q => q.labelStatus === 'expert_approved') });
  const report = { datasetSha256: createHash('sha256').update(datasetBytes).digest('hex'), labelStatus: 'pending_expert_review',
    datasetSize: questions.length, developmentSize: development.length, evaluationSize: evaluation.length,
    tuning, development: developmentResults, evaluation: results, decision };
  const output = new URL('../../evaluation/phase6-results/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('benchmark.json', output), JSON.stringify(report, null, 2));
  await writeFile(new URL('expert-review.json', output), JSON.stringify(results.hybrid.reviews, null, 2));
  return { datasetSize: questions.length, selectedWeights: tuning.selectedWeights,
    evaluation: Object.fromEntries(Object.entries(results).map(([mode, result]) => [mode, { metrics: result.metrics, errorCounts: result.errorCounts }])), decision };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await runGoldBenchmark(), null, 2));
