import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corpusPolicy, contentChecksum, reviewCorpusSource, validateCandidate, assertProductionSource, productionEligible } from '../src/knowledge/production_guard.js';
import { createReligionKnowledgeProvider, jsonKnowledgeStore, knowledgeNamespaces } from '../src/knowledge/provider.js';
import { createMemoryVectorStore } from '../src/knowledge/vector_store.js';
import { createLocalEmbeddingProvider } from '../src/knowledge/embedding_provider.js';
import { createCorpusIngestion } from '../src/knowledge/ingestion/pipeline.js';
import { buildSourceContext } from '../src/knowledge/source_context_builder.js';
import { normalizeRetrievalQuery } from '../src/knowledge/query_normalization.js';
import { createReRanker } from '../src/knowledge/reranker.js';
import { createRetrievalStrategy } from '../src/knowledge/retrieval_strategy.js';
import { explainRetrievalConfidence, applyRetrievalConfidence } from '../src/knowledge/retrieval_confidence.js';
import { validateGoldSplit, tuneDevelopment, benchmarkQuestions, promotionDecision } from '../src/evaluation/gold_benchmark.js';
import { classifyRetrievalErrors } from '../src/evaluation/retrieval_errors.js';
import { corpusReviewExport, reviewCorpusCommand } from '../src/knowledge/corpus_review_cli.js';
import { createConversationService } from '../src/conversation_service.js';
import { createApp } from '../src/app.js';
import { responseSchema } from '../src/schema.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

const stamp = '2026-01-01T00:00:00.000Z';
function candidate(text = '위로를 위해 잠시 쉬어 보셔도 괜찮습니다.') {
  return { sourceId: 'protestant:fixture:1', tradition: 'protestant', title: '위로 테스트', reference: '테스트 1', text,
    sourceType: 'pastoral', authorityLevel: 'secondary', language: 'ko-KR', metadata: {
      sample: false, license: 'Own test text', keywords: ['위로'], concepts: ['protestant:care'], traditionBranch: 'general',
      qualityScore: 0.7, licenseStatus: 'self_authored', licenseNote: 'Synthetic test fixture only',
      sourceUrl: 'https://example.invalid/fixture', publisher: 'Synthetic test publisher', provenance: 'No actual corpus',
      importedAt: stamp, originalLanguage: 'ko-KR', contentLanguage: 'ko-KR', sourceVersion: '1', checksum: contentChecksum(text),
      reviewStatus: 'candidate', reviewedBy: null, reviewedAt: null,
    } };
}
function approved(source = candidate()) {
  return reviewCorpusSource(reviewCorpusSource(source, { status: 'reviewed', reviewer: 'test-reviewer', at: stamp }), { status: 'approved', reviewer: 'test-reviewer', at: stamp });
}
const search = { tradition: 'protestant', query: '위로', language: 'ko-KR', limit: 3 };
const env = { NODE_ENV: 'production', SOUL_COST_ROUTER_V1_ENABLED: 'false', SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only' };
const quiet = { info() {}, warn() {} };
const body = message => ({ session: { sessionId: 'phase6', selectedEmotion: '불안', emotionIntensity: 6, turnCount: 1 }, userMessage: message,
  systemPromptVersion: 'ko-v1', allowedVerseIds: [] });
const mock = async task => task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput();
const dataset = async () => JSON.parse(await readFile(new URL('../evaluation/gold-candidate-v1.json', import.meta.url), 'utf8'));

for (const id of Object.keys(knowledgeNamespaces)) test(`production: ${id} policy is independent and samples stay development`, async () => {
  const policy = corpusPolicy(id);
  assert.equal(policy.tradition, id); assert.ok(policy.allowedSourceTypes.length);
  assert.ok(policy.reviewRequirement.approvalFingerprintRequired);
  const samples = await jsonKnowledgeStore.load(knowledgeNamespaces[id]);
  assert.ok(samples.every(source => source.metadata.reviewStatus === 'development'));
  const kb = createReligionKnowledgeProvider({ mode: 'production' });
  assert.deepEqual((await kb.search({ ...search, tradition: id, query: samples[0].metadata.keywords[0] })).results, []);
});

test('production: only approved sources reach search; every other review/license state is excluded', async () => {
  const good = approved();
  const records = [good, ...['development', 'candidate', 'reviewed', 'rejected'].map((reviewStatus, i) => ({ ...candidate(), sourceId: `protestant:fixture:${i + 2}`, metadata: { ...candidate().metadata, reviewStatus } }))];
  records.push({ ...candidate(), sourceId: 'protestant:fixture:unknown', metadata: { ...candidate().metadata, licenseStatus: 'unknown', reviewStatus: 'approved' } });
  const kb = createReligionKnowledgeProvider({ mode: 'production', store: { load: async () => records } });
  assert.deepEqual((await kb.search(search)).results, [good]);
});

test('production: provenance and policy omissions prevent approval', () => {
  for (const field of ['publisher', 'sourceUrl', 'originalLanguage', 'contentLanguage', 'sourceVersion', 'checksum', 'licenseNote', 'traditionBranch']) {
    const source = candidate(); delete source.metadata[field];
    assert.throws(() => validateCandidate(source), field);
  }
  assert.throws(() => validateCandidate({ ...candidate(), sourceType: 'quran' }));
  const source = candidate(); source.metadata.sample = true; assert.throws(() => approved(source));
});

test('production: review transitions are explicit and approval is invalidated by source changes', () => {
  assert.throws(() => reviewCorpusSource(candidate(), { status: 'approved', reviewer: 'test' }));
  assert.throws(() => reviewCorpusSource(candidate(), { status: 'reviewed', reviewer: '' }));
  const good = approved(); assert.doesNotThrow(() => assertProductionSource(good));
  for (const mutate of [source => { source.text += '변경'; }, source => { source.metadata.sourceUrl += '/changed'; }, source => { source.metadata.traditionBranch = 'Reformed'; }]) {
    const changed = structuredClone(good); mutate(changed); assert.equal(productionEligible(changed), false);
  }
  assert.equal(productionEligible(reviewCorpusSource(good, { status: 'rejected', reviewer: 'test', at: stamp })), false);
});

test('production: vector ingestion blocks unapproved input before embeddings and derived chunks preserve approval', async () => {
  const vectors = createMemoryVectorStore({ mode: 'production' });
  const embeddings = createLocalEmbeddingProvider(); let calls = 0;
  const provider = { id: embeddings.id, embedBatch: (...args) => { calls++; return embeddings.embedBatch(...args); } };
  const pipeline = createCorpusIngestion({ mode: 'production', vectorStore: vectors, embeddingProvider: provider });
  await assert.rejects(pipeline.ingest(candidate())); assert.equal(calls, 0);
  const source = approved(candidate('첫째 문단입니다.\n\n둘째 문단입니다.'));
  const result = await pipeline.ingest(source);
  assert.equal(result.records.length, 2); assert.ok(result.records.every(productionEligible));
  assert.ok(result.records.every(record => record.metadata.parentApprovalFingerprint === source.metadata.approvalFingerprint));
  await assert.rejects(vectors.upsert([{ namespace: 'christianity', id: candidate().sourceId, record: candidate(), vector: [1, 0], embeddingId: 'test' }]));
});

test('production: sourceContext rejects an injected unapproved provider and wrong tradition', () => {
  assert.throws(() => buildSourceContext({ tradition: 'protestant', query: '위로', results: [candidate()] }, search, { mode: 'production' }));
  const source = approved();
  assert.doesNotThrow(() => buildSourceContext({ tradition: 'protestant', query: '위로', results: [source] }, search, { mode: 'production' }));
  assert.throws(() => buildSourceContext({ tradition: 'buddhist', query: '위로', results: [source] }, search, { mode: 'production' }));
});

test('retrieval: branch and language are hard filters with no general-branch substitution', async () => {
  const general = approved();
  const raw = candidate(); raw.sourceId = 'protestant:fixture:branch'; raw.metadata.traditionBranch = 'Reformed';
  const selected = approved(raw);
  const kb = createReligionKnowledgeProvider({ mode: 'production', store: { load: async () => [general, selected] } });
  assert.deepEqual((await kb.search({ ...search, traditionBranch: 'Reformed' })).results, [selected]);
  assert.deepEqual((await kb.search({ ...search, language: 'en-US' })).results, []);
  assert.throws(() => buildSourceContext({ tradition: search.tradition, query: search.query, results: [general] }, { ...search, traditionBranch: 'Reformed' }));
});

test('retrieval: local query normalization preserves references and isolates tradition concepts', () => {
  const normalized = normalizeRetrievalQuery({ tradition: 'protestant', query: '불안할 때 성경에서는 뭐라고 해? 창세기 1:1' });
  assert.match(normalized.query, /두려움/); assert.match(normalized.query, /위로/); assert.match(normalized.query, /창세기 1:1/);
  assert.ok(normalizeRetrievalQuery({ tradition: 'islamic', query: 'sabr' }).concepts.includes('islamic:sabr'));
  assert.equal(normalizeRetrievalQuery({ tradition: 'protestant', query: 'sabr' }).concepts.length, 0);
  assert.ok(!normalizeRetrievalQuery({ tradition: 'protestant', query: 'prayerful' }).concepts.includes('protestant:prayer'));
});

test('reranker: weights and debug components are explicit, finite and configurable', () => {
  const records = [candidate(), { ...candidate(), sourceId: 'protestant:fixture:2', text: '다른 설명', authorityLevel: 'primary' }];
  const request = { candidates: records.map(record => ({ record, vectorScore: 0.8 })), ...search };
  const a = createReRanker({ keyword: 0.8, vector: 0.2 }).rerank(request);
  const b = createReRanker({ keyword: 0.2, vector: 0.8 }).rerank(request);
  assert.notEqual(a[0].components.lexical, b[0].components.lexical);
  for (const key of ['semantic', 'lexical', 'authority', 'reference', 'branch', 'quality', 'duplicate', 'language', 'tradition', 'conceptMatch']) assert.ok(Number.isFinite(a[0].components[key]));
  assert.throws(() => createReRanker({ vector: NaN }));
});

test('benchmark: 140 Gold candidates have disjoint development/evaluation splits and required labels', async () => {
  const questions = await dataset(); validateGoldSplit(questions); assert.equal(questions.length, 140);
  assert.equal(questions.filter(q => q.split === 'development').length, 70);
  for (const tradition of Object.keys(knowledgeNamespaces)) assert.equal(questions.filter(q => q.tradition === tradition).length, 20);
  assert.equal(new Set(questions.map(q => q.category)).size, 9);
  assert.ok(questions.every(q => q.labelStatus === 'pending_expert_review'));
  assert.throws(() => validateGoldSplit([...questions, { ...questions[0], id: 'copy', split: 'evaluation' }]));
});

test('benchmark: tuning rejects evaluation data and compares keyword/vector/hybrid on identical rows', async () => {
  const questions = await dataset();
  const config = { keywordWeights: [0.2, 0.8], authorityWeights: [0.1], referenceWeights: [0.1], branchWeight: 0.05, qualityWeight: 0.05, duplicatePenalty: 0.25 };
  await assert.rejects(tuneDevelopment(questions.filter(q => q.split === 'evaluation'), config));
  const tuned = await tuneDevelopment(questions.filter(q => q.split === 'development').slice(0, 10), config);
  assert.equal(tuned.trials.length, 2);
  let rows;
  for (const strategy of ['keyword', 'vector', 'hybrid']) {
    const result = await benchmarkQuestions(questions.filter(q => q.split === 'evaluation').slice(0, 10), { strategy, weights: tuned.selectedWeights });
    const ids = result.rows.map(row => row.questionId);
    if (rows) assert.deepEqual(ids, rows); rows = ids;
    for (const key of ['recallAt1', 'recallAt3', 'recallAt5', 'precisionAt3', 'mrr', 'wrongTraditionRate', 'emptyRetrievalRate']) assert.ok(Number.isFinite(result.metrics[key]));
  }
});

test('benchmark: error taxonomy distinguishes abstention, empty results and ranking failures', async () => {
  const q = (await dataset())[0];
  const good = { ...candidate(), sourceId: q.expectedSourceCriteria.ids[0], tradition: q.tradition };
  good.metadata.concepts = q.expectedConcepts;
  assert.ok(classifyRetrievalErrors(q, []).includes('EMPTY_RESULT'));
  assert.ok(classifyRetrievalErrors(q, [{ ...good, tradition: 'buddhist' }]).includes('WRONG_TRADITION'));
  assert.ok(classifyRetrievalErrors(q, [good, good]).includes('DUPLICATE_RESULT'));
  assert.ok(classifyRetrievalErrors(q, [{ ...good, sourceId: 'wrong' }, good]).includes('RANKING_FAILURE'));
  assert.ok(!classifyRetrievalErrors({ ...q, expectedSourceCriteria: { ...q.expectedSourceCriteria, ids: [], allowEmpty: true } }, []).includes('EMPTY_RESULT'));
});

test('confidence: margin and branch are explained and low confidence forbids specific quotations', () => {
  const sources = [approved(), { ...approved(), sourceId: 'protestant:fixture:2' }].map(source => ({ ...source, religion: source.tradition }));
  const base = { sources, tradition: 'protestant', topScore: 0.9, citationResult: 'passed' };
  const separated = explainRetrievalConfidence({ ...base, secondScore: 0.1 });
  assert.ok(separated.score > explainRetrievalConfidence({ ...base, secondScore: 0.89 }).score);
  assert.ok(separated.components.margin > 0);
  assert.equal(explainRetrievalConfidence({ ...base, traditionBranch: 'Reformed' }).score, 0);
  const output = applyRetrievalConfidence({ tradition: 'protestant', religiousInsight: '창세기 1:1의 말씀입니다.', suggestedPractice: { guidance: '"가상 인용"', reflectionQuestion: '어떠신가요?' }, sourceHints: ['fake'], caution: [] }, 0.1);
  assert.deepEqual(output.sourceHints, []); assert.match(output.religiousInsight, /충분히 신뢰할 만한 근거/);
});

test('corpus CLI: export carries review fields, samples cannot pass production verification', async () => {
  const rows = corpusReviewExport([candidate(), approved()]);
  assert.equal(rows[0].productionApproved, false); assert.equal(rows[1].productionApproved, true);
  assert.equal(rows[0].answer, null); assert.equal(rows[0].reviewSafety, null);
  assert.ok(!Object.hasOwn(rows[0], 'text'));
  await assert.rejects(reviewCorpusCommand(['--verify-production']));
});

test('corpus CLI: empty input cannot pass production verification and invalid options fail', async () => {
  for (const args of [['--unknown'], ['--input', '--verify-production'], ['--verify-production', '--verify-production']]) {
    await assert.rejects(reviewCorpusCommand(args));
  }
  const directory = await mkdtemp(join(tmpdir(), 'soul-corpus-review-'));
  try {
    const input = join(directory, 'empty.json');
    await writeFile(input, '[]');
    await assert.rejects(reviewCorpusCommand(['--input', input, '--verify-production']), /nonempty approved corpus/);
    assert.deepEqual(await reviewCorpusCommand(['--input', input]), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('benchmark: expert export retains safety cases without adding them to retrieval metrics', async () => {
  const questions = (await dataset()).filter(q => q.split === 'evaluation');
  const result = await benchmarkQuestions(questions, { strategy: 'keyword' });
  assert.equal(result.reviews.length, questions.length);
  assert.deepEqual(result.reviews.map(row => row.questionId), questions.map(q => q.id));
  const safetyRows = result.reviews.filter(row => row.safetyResult === 'intercepted');
  assert.equal(safetyRows.length, 7);
  assert.equal(result.rows.length + safetyRows.length, questions.length);
  for (const row of safetyRows) {
    responseSchema.parse(row.answer);
    assert.deepEqual(row.retrievedSources, []);
    assert.equal(row.reviewSafety, null);
  }
});

test('promotion: quality gates prevent automatic promotion on unreviewed or regressed results', () => {
  const keyword = { mrr: 0.5, recallAt3: 0.8, wrongTraditionRate: 0 };
  assert.equal(promotionDecision(keyword, { ...keyword, mrr: 0.6 }).promoted, false);
  assert.equal(promotionDecision(keyword, { ...keyword, mrr: 0.6 }, { expertReviewed: true }).promoted, true);
  assert.equal(promotionDecision(keyword, { ...keyword, mrr: 0.6, recallAt3: 0.7 }, { expertReviewed: true }).promoted, false);
});

test('production service: no approved corpus means no religious model call; HTTP API is unchanged', async () => {
  const calls = []; const logs = [];
  const generate = createConversationService({ env, logger: { info: (_, row) => logs.push(row), warn() {} }, openAiFactory: () => ({ runStructured: async task => { calls.push(task.name); return mock(task); } }) });
  const app = createApp({ generate, memberStore: {}, logger: { error() {} } });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body('기독교 성경을 인용해주세요')) });
    assert.equal(response.status, 200);
    const result = await response.json(); responseSchema.parse(result);
    assert.match(result.message, /충분히 신뢰할 만한 근거/);
    assert.deepEqual(calls, ['psychology_reflection']);
    assert.equal(result.confidenceDebug, undefined);
    assert.equal(logs[0].retrievalMode, 'keyword');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('production service: injected unapproved sources fall back and disabled flag remains identical', async () => {
  const logs = [];
  const generate = createConversationService({ env, logger: { info: (_, row) => logs.push(row), warn() {} }, openAiFactory: () => ({ runStructured: mock }),
    knowledgeProvider: { search: async request => ({ tradition: request.tradition, query: request.query, results: [candidate()] }) } });
  responseSchema.parse(await generate(body('기독교 위로')));
  assert.equal(logs[0].fallbackReason, 'knowledge_retrieval');
  const off = createConversationService({ env: { ...env, SOUL_MULTI_AGENT_ENABLED: 'false' }, logger: quiet,
    openAiFactory: () => assert.fail('disabled'), knowledgeProvider: { search: () => assert.fail('disabled') } });
  const local = createConversationService({ env: {}, logger: quiet });
  assert.deepEqual(await off(body('위로')), await local(body('위로')));
});
