import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLocalEmbeddingProvider, withEmbeddingDeadline } from '../src/knowledge/embedding_provider.js';
import { createOpenAiEmbeddingAdapter } from '../src/knowledge/openai_embedding_adapter.js';
import { createMemoryVectorStore, cosineSimilarity } from '../src/knowledge/vector_store.js';
import { createHybridRetriever } from '../src/knowledge/hybrid_retriever.js';
import { deterministicReRanker } from '../src/knowledge/reranker.js';
import { createReligionKnowledgeProvider } from '../src/knowledge/provider.js';
import { buildSourceContext } from '../src/knowledge/source_context_builder.js';
import { createCorpusIngestion } from '../src/knowledge/ingestion/pipeline.js';
import { chunkSource } from '../src/knowledge/ingestion/chunking.js';
import { calculateRetrievalConfidence, applyRetrievalConfidence } from '../src/knowledge/retrieval_confidence.js';
import { validateCitations } from '../src/agents/citation_validator.js';
import { referenceMatches } from '../src/agents/citation_grounding.js';
import { comparisonTraditions } from '../src/agents/religion_router.js';
import { createConversationOrchestrator } from '../src/agents/conversation_orchestrator.js';
import { createConversationService } from '../src/conversation_service.js';
import { responseSchema } from '../src/schema.js';
import { createApp } from '../src/app.js';
import { retrievalMetrics } from '../src/evaluation/metrics.js';
import { createResponseReview } from '../src/evaluation/response_review.js';
import { evaluateRetrieval } from '../src/evaluation/run_evaluation.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

const record = (overrides = {}) => ({ sourceId: 'protestant:test:1', tradition: 'protestant', title: '위로', reference: '테스트 문서 1:1',
  text: '위로에 관한 자체 작성 테스트 문장입니다.', language: 'ko-KR', sourceType: 'authored_sample', authorityLevel: 'secondary',
  metadata: { sample: true, license: 'Original fixture', keywords: ['위로'], traditionBranch: 'general', qualityScore: 0.5,
    licenseStatus: 'self_authored', licenseNote: 'Written for this test', provenance: 'onaria test fixture', importedAt: '2026-09-07T00:00:00.000Z' }, ...overrides });
const input = (records = [record()], overrides = {}) => ({ records, query: '위로', tradition: 'protestant', language: 'ko-KR', limit: 3, ...overrides });
const body = (userMessage = '위로', religion) => ({ session: { sessionId: 'vector-rag', selectedEmotion: '불안', emotionIntensity: 6, turnCount: 1 },
  userMessage, religion, systemPromptVersion: 'ko-v1', allowedVerseIds: [] });
const env = { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only' };
const quiet = { info() {}, warn() {} };
const mockModel = async task => task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput();

test('vector: deterministic local embeddings relate bilingual concepts without network', async () => {
  const provider = createLocalEmbeddingProvider();
  assert.equal(provider.external, false);
  assert.deepEqual(await provider.embed('위로'), await provider.embed('위로'));
  const [a, b, c] = await provider.embedBatch(['위로', 'comfort', 'zxqv']);
  assert.ok(cosineSimilarity(a, b) > cosineSimilarity(a, c));
  await assert.rejects(provider.embedBatch(Array(33).fill('text')));
  await assert.rejects(provider.embed(''));
});

test('vector: namespace, model and dimensions are enforced; delete and clear are scoped', async () => {
  const store = createMemoryVectorStore();
  const items = [
    { namespace: 'christianity', id: record().sourceId, record: record(), vector: [1, 0], embeddingId: 'test-v1' },
    { namespace: 'buddhism', id: 'buddhist:test:1', record: record({ sourceId: 'buddhist:test:1', tradition: 'buddhist' }), vector: [1, 0], embeddingId: 'test-v1' },
  ];
  await store.upsert(items);
  assert.equal((await store.search([1, 0], { namespace: 'christianity', embeddingId: 'test-v1' }))[0].record.tradition, 'protestant');
  await assert.rejects(store.search([1, 0], { namespace: 'all', embeddingId: 'test-v1' }));
  await assert.rejects(store.search([1, 0], { namespace: 'christianity', embeddingId: 'test-v2' }));
  await assert.rejects(store.search([1, 0, 0], { namespace: 'christianity', embeddingId: 'test-v1' }));
  await assert.rejects(store.upsert([{ ...items[0], namespace: 'buddhism' }]));
  await assert.rejects(store.upsert([{ ...items[0], vector: [NaN, 1] }]));
  await store.delete('christianity', [items[0].id]);
  assert.deepEqual(await store.search([1, 0], { namespace: 'christianity', embeddingId: 'test-v1' }), []);
  assert.equal((await store.search([1, 0], { namespace: 'buddhism', embeddingId: 'test-v1' })).length, 1);
  await store.clear('buddhism');
  assert.deepEqual(await store.search([1, 0], { namespace: 'buddhism', embeddingId: 'test-v1' }), []);
});

test('vector: hybrid retrieves a semantic-only match and preserves original evidence', async () => {
  const result = await createHybridRetriever().retrieve(input([record()], { query: 'comfort' }));
  assert.equal(result.diagnostics.retrievalMode, 'hybrid');
  assert.deepEqual(result.records, [record()]);
  assert.equal(result.diagnostics.scores[0].keywordScore, 0);
  assert.ok(result.diagnostics.scores[0].vectorScore > 0.35);
});

test('vector: exact reference can enter candidates without keyword or semantic match', async () => {
  const result = await createHybridRetriever({ embeddingProvider: { id: 'test', embedBatch: async texts => texts.map(() => [1, 0]), embed: async () => [0, 1] } })
    .retrieve(input([record()], { query: '테스트 문서 1:1' }));
  assert.deepEqual(result.records, [record()]);
  assert.equal(result.diagnostics.retrievalMode, 'hybrid');
});

for (const [name, config, expected] of [
  ['disabled', { embeddingProvider: null }, 'embedding_unavailable'],
  ['embedding failure', { embeddingProvider: { id: 'broken', embedBatch: async () => { throw Error('offline'); } } }, 'embedding_unavailable'],
  ['store failure', { vectorStoreFactory: () => ({ upsert: async () => { throw Error('store'); } }) }, 'vector_unavailable'],
]) test(`vector: ${name} uses preserved keyword fallback`, async () => {
  const result = await createHybridRetriever(config).retrieve(input());
  assert.deepEqual(result.records, [record()]);
  assert.equal(result.diagnostics.retrievalMode, 'keyword_fallback');
  assert.equal(result.diagnostics.fallbackReason, expected);
});

test('vector: malicious vector hits cannot introduce another tradition or forged source', async () => {
  const retriever = createHybridRetriever({ vectorStoreFactory: () => ({ upsert: async () => {}, search: async () => [{ record: record({ tradition: 'islamic' }), score: 1 }] }) });
  const result = await retriever.retrieve(input());
  assert.deepEqual(result.records, [record()]);
  assert.equal(result.diagnostics.retrievalMode, 'keyword_fallback');
});

test('vector: stalled embedding times out to keyword and outer abort stops work', async () => {
  const result = await createHybridRetriever({ timeoutMs: 10, embeddingProvider: { id: 'pending', embedBatch: () => new Promise(() => {}) } }).retrieve(input());
  assert.equal(result.diagnostics.retrievalMode, 'keyword_fallback');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createHybridRetriever().retrieve(input(), { signal: controller.signal }));
  await assert.rejects(withEmbeddingDeadline(() => new Promise(() => {}), { timeoutMs: 10 }));
});

test('vector: reranker uses reference, authority, branch, quality, relevance and duplicate penalties', () => {
  const primary = record({ sourceId: 'primary', authorityLevel: 'primary', metadata: { ...record().metadata, qualityScore: 1, traditionBranch: 'selected' } });
  const duplicate = record({ sourceId: 'duplicate' });
  const wrong = record({ sourceId: 'wrong', tradition: 'buddhist' });
  const otherLanguage = record({ sourceId: 'english', language: 'en-US' });
  const ranked = deterministicReRanker.rerank({ ...input(), query: '테스트 문서 1:1 위로', traditionBranch: 'selected', limit: 5,
    candidates: [primary, duplicate, wrong, otherLanguage].map(record => ({ record, vectorScore: 0.8 })) });
  assert.deepEqual(ranked.map(row => row.record.sourceId), ['primary', 'duplicate']);
  assert.ok(ranked[0].rerankScore > ranked[1].rerankScore);
});

test('ingestion: semantic chunks preserve exact source locations and complete provenance', async () => {
  const store = createMemoryVectorStore(); const embeddingProvider = createLocalEmbeddingProvider();
  const pipeline = createCorpusIngestion({ embeddingProvider, vectorStore: store });
  const raw = record({ text: '첫 번째 문단입니다.\r\n\r\n두 번째 문단입니다.' });
  const result = await pipeline.ingest(raw);
  assert.equal(result.records.length, 2);
  const normalized = raw.text.replace(/\r\n/g, '\n');
  for (const chunk of result.records) {
    assert.equal(chunk.metadata.originalSourceId, raw.sourceId);
    assert.equal(chunk.metadata.licenseStatus, 'self_authored');
    const { start, end } = chunk.metadata.location;
    assert.equal(normalized.slice(start, end), chunk.text);
  }
  assert.equal((await store.search(await embeddingProvider.embed('문단'), { namespace: result.namespace, embeddingId: embeddingProvider.id })).length, 2);
  const kb = createReligionKnowledgeProvider({ store: { load: async () => result.records } });
  assert.ok((await kb.search({ tradition: 'protestant', query: '문단', language: 'ko-KR', limit: 3 })).results.length);
  assert.throws(() => chunkSource(record({ text: 'a'.repeat(4001) })));
});

test('ingestion: unknown license, missing provenance and embedding failures never write vectors', async () => {
  let writes = 0;
  const vectorStore = { upsert: async () => { writes++; } };
  const pipeline = createCorpusIngestion({ embeddingProvider: createLocalEmbeddingProvider(), vectorStore });
  for (const metadata of [{ ...record().metadata, licenseStatus: 'unknown' }, { ...record().metadata, provenance: undefined }]) {
    await assert.rejects(pipeline.ingest(record({ metadata })));
  }
  const broken = createCorpusIngestion({ embeddingProvider: { embedBatch: async () => { throw Error('failed'); } }, vectorStore });
  await assert.rejects(broken.ingest(record())); assert.equal(writes, 0);
  const unlicensed = record({ metadata: { ...record().metadata, licenseStatus: 'unknown' } });
  await assert.rejects(createReligionKnowledgeProvider({ store: { load: async () => [unlicensed] } }).search({ tradition: 'protestant', query: '위로' }));
  assert.throws(() => buildSourceContext({ tradition: 'protestant', query: '위로', results: [unlicensed] }, { tradition: 'protestant', query: '위로' }));
});

test('ingestion: pre-indexed hybrid path reuses vectors without online corpus embedding', async () => {
  const store = createMemoryVectorStore(); const local = createLocalEmbeddingProvider();
  const { records } = await createCorpusIngestion({ embeddingProvider: local, vectorStore: store }).ingest(record());
  const queryOnly = { id: local.id, embed: (text, options) => local.embed(text, options), embedBatch: () => assert.fail('must reuse ingested index') };
  const kb = createReligionKnowledgeProvider({ store: { load: async () => records },
    retriever: createHybridRetriever({ embeddingProvider: queryOnly, indexedVectorStore: store }),
  });
  const result = await kb.search({ tradition: 'protestant', query: '위로' });
  assert.equal(result.diagnostics.retrievalMode, 'hybrid');
  assert.equal(result.results[0].sourceId, records[0].sourceId);
});

test('external embedding: missing explicit flags or model performs zero client creation', async () => {
  let clients = 0;
  for (const config of [{}, { OPENAI_API_KEY: 'test-only' }, { SOUL_EMBEDDING_ENABLED: 'true', OPENAI_API_KEY: 'test-only' }]) {
    const provider = createOpenAiEmbeddingAdapter({ env: config, clientFactory: () => { clients++; } });
    await assert.rejects(provider.embed('text'));
  }
  assert.equal(clients, 0);
});

test('external embedding: injected fake adapter validates index order, batch budget and disables retry', async () => {
  let calls = 0;
  const provider = createOpenAiEmbeddingAdapter({ env: { SOUL_EMBEDDING_ENABLED: 'true', SOUL_EMBEDDING_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only', OPENAI_EMBEDDING_MODEL: 'test-embedding' },
    clientFactory: options => {
      assert.equal(options.maxRetries, 0);
      return { embeddings: { create: async (body, options) => {
        calls++; assert.equal(options.maxRetries, 0); assert.equal(body.encoding_format, 'float');
        return { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] };
      } } };
    },
  });
  assert.deepEqual(await provider.embedBatch(['first', 'second']), [[1, 0], [0, 1]]);
  await assert.rejects(provider.embedBatch(Array(33).fill('text')));
  assert.equal(calls, 1);
});

test('external embedding: malformed vectors fail and online corpus budget prevents any paid calls', async () => {
  const provider = createOpenAiEmbeddingAdapter({ env: { SOUL_EMBEDDING_ENABLED: 'true', SOUL_EMBEDDING_PROVIDER: 'openai', OPENAI_API_KEY: 'test-only', OPENAI_EMBEDDING_MODEL: 'test-embedding' },
    clientFactory: () => ({ embeddings: { create: async () => ({ data: [{ index: 0, embedding: [NaN] }] }) } }),
  });
  await assert.rejects(provider.embed('text'));
  let calls = 0;
  const retriever = createHybridRetriever({ embeddingProvider: { external: true, id: 'budget', embedBatch: async () => { calls++; } } });
  const records = Array.from({ length: 65 }, (_, i) => record({ sourceId: `test:${i}` }));
  assert.equal((await retriever.retrieve(input(records))).diagnostics.retrievalMode, 'keyword_fallback');
  assert.equal(calls, 0);
});

test('citation: full reference matching rejects prefix collisions and evaluator can be replaced', () => {
  const source = { id: 'test:1', religion: 'protestant', reference: '창세기 1:10', text: '테스트 경전은 성찰을 가르칩니다.' };
  assert.equal(referenceMatches('창세기 1:1', source), false);
  assert.equal(referenceMatches('창세기 1:10', source), true);
  assert.equal(validateCitations(religionOutput({ perspective: '창세기 1:1을 읽으세요.', sourceRefs: ['test:1'] }), { tradition: 'protestant', sourceContext: [source] }).status, 'repaired');
  let calls = 0;
  const checked = validateCitations(religionOutput({ perspective: source.text, sourceRefs: ['test:1'] }), { tradition: 'protestant', sourceContext: [source], evaluator: { evaluate: () => { calls++; return { supported: false, exceedsEvidence: true }; } } });
  assert.equal(calls, 1); assert.equal(checked.status, 'repaired');
});

test('confidence: score, count, authority, citation, ambiguity and tradition affect support', () => {
  const sources = [{ religion: 'protestant', authorityLevel: 'primary', metadata: { sample: false } }];
  const base = { sources, tradition: 'protestant', topScore: 0.9, citationResult: 'passed' };
  const high = calculateRetrievalConfidence(base);
  assert.ok(high > 0.7);
  for (const override of [{ topScore: 0.1 }, { ambiguous: true }, { citationResult: 'not_run' }]) assert.ok(calculateRetrievalConfidence({ ...base, ...override }) < high);
  assert.equal(calculateRetrievalConfidence({ ...base, tradition: 'buddhist' }), 0);
  assert.equal(calculateRetrievalConfidence({ ...base, citationResult: 'repaired' }), 0);
  assert.equal(calculateRetrievalConfidence({ ...base, sources: [] }), 0);
  const softened = applyRetrievalConfidence({ tradition: 'protestant', religiousInsight: '이것이 유일한 구원 교리입니다.', confidence: 1 }, 0.1);
  assert.match(softened.religiousInsight, /확실한 근거를 찾지 못했습니다/);
});

test('confidence: low evidence is softened in the real integration path and logged', async () => {
  const logs = [];
  const weak = record({ text: '이것은 성찰의 가르침입니다.', metadata: { ...record().metadata, sample: false, qualityScore: 0.1 } });
  const knowledgeProvider = { search: async request => ({ tradition: request.tradition, query: request.query, results: [weak] }) };
  const generate = createConversationService({ env, knowledgeProvider, logger: { info: (_, row) => logs.push(row), warn() {} },
    openAiFactory: () => ({ runStructured: async task => task.name === 'psychology_reflection' ? psychologyOutput()
      : religionOutput({ perspective: weak.text, sourceRefs: [weak.sourceId] }) }),
  });
  const result = await generate(body('위로', 'protestant'));
  assert.match(result.message, /확실한 근거를 찾지 못했습니다/);
  assert.ok(logs[0].retrievalConfidence < 0.4);
  assert.equal(logs[0].fallbackReason, null);
});

test('source context: forged diagnostic source scores are rejected', () => {
  const request = { tradition: 'protestant', query: '위로' };
  assert.throws(() => buildSourceContext({ ...request, results: [record()], diagnostics: { retrievalMode: 'hybrid', fallbackReason: null,
    scores: [{ sourceId: 'different', keywordScore: 1, vectorScore: 1, rerankScore: 1 }] } }, request));
});

test('comparison: explicit query retrieves isolated namespaces once after psychology', async () => {
  const seen = []; const kb = createReligionKnowledgeProvider();
  const generate = createConversationOrchestrator({ knowledgeProvider: { search: async (input, options) => { seen.push(`kb:${input.tradition}`); return kb.search(input, options); } },
    runStructured: async task => {
      seen.push(task.name);
      if (task.name === 'psychology_reflection') return psychologyOutput();
      const id = task.name.slice('religion_'.length);
      assert.ok(task.input.sourceContext.every(source => source.religion === id));
      return religionOutput();
    },
  });
  const response = await generate(body('기독교와 불교에서는 불안을 어떻게 보나요?'));
  responseSchema.parse(response);
  assert.deepEqual(seen, ['psychology_reflection', 'kb:protestant', 'religion_protestant', 'kb:buddhist', 'religion_buddhist']);
  assert.match(response.message, /\[개신교\]/); assert.match(response.message, /\[불교\]/);
  assert.equal(response.shouldOfferVerse, false);
  assert.deepEqual(comparisonTraditions({ userMessage: '기독교와 불교' }), []);
  assert.deepEqual(comparisonTraditions({ religion: 'catholic', userMessage: '기독교와 불교를 비교해 주세요' }), []);
});

test('comparison: safety prevents retrieval and failure still uses original local fallback', async () => {
  let kbCalls = 0;
  const logs = [];
  const generate = createConversationService({ env, logger: { info: (_, data) => logs.push(data), warn() {} },
    knowledgeProvider: { search: async () => { kbCalls++; throw Error('private failure'); } }, openAiFactory: () => ({ runStructured: mockModel }) });
  assert.equal((await generate(body('죽고 싶어요. 기독교와 불교를 비교해 주세요'))).stage, 'crisis');
  assert.equal(kbCalls, 0);
  responseSchema.parse(await generate(body('기독교와 불교를 비교해 주세요')));
  assert.equal(logs[1].fallbackReason, 'knowledge_retrieval');
});

test('service: hybrid HTTP fields remain private and disabled flag makes no knowledge/model calls', async () => {
  const logs = [];
  const generate = createConversationService({ env, logger: { info: (_, value) => logs.push(value), warn() {} }, openAiFactory: () => ({ runStructured: mockModel }) });
  const app = createApp({ generate, memberStore: {}, logger: { error() {} } });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body('기독교 위로')) });
    assert.equal(result.status, 200);
    const json = await result.json(); responseSchema.parse(json);
    assert.equal(json.retrievalConfidence, undefined);
    assert.equal(logs[0].retrievalMode, 'hybrid');
    assert.ok(logs[0].vectorScore > 0);
    assert.ok(!JSON.stringify(logs).includes('기독교 위로'));
  } finally { await new Promise(resolve => server.close(resolve)); }
  const off = createConversationService({ env: { ...env, SOUL_MULTI_AGENT_ENABLED: 'false' }, logger: quiet, knowledgeProvider: { search: () => assert.fail('disabled') }, openAiFactory: () => assert.fail('disabled') });
  const baseline = createConversationService({ env: {}, logger: quiet });
  assert.deepEqual(await off(body()), await baseline(body()));
});

test('evaluation: 70 synthetic fixtures cover every tradition and required category', async () => {
  const questions = JSON.parse(await readFile(new URL('../evaluation/questions.json', import.meta.url), 'utf8'));
  assert.equal(questions.length, 70);
  assert.equal(new Set(questions.map(q => q.id)).size, 70);
  for (const tradition of ['protestant', 'catholic', 'buddhist', 'jewish', 'islamic', 'hindu', 'confucian']) {
    const group = questions.filter(q => q.tradition === tradition);
    assert.equal(group.length, 10);
    assert.equal(new Set(group.map(q => q.category)).size, 8);
    assert.ok(group.every(q => q.expectedTradition.length && q.citationExpectation && q.safetyExpectation && q.mustNotContain.length));
  }
  const result = await evaluateRetrieval({ questions, provider: createReligionKnowledgeProvider() });
  assert.equal(result.metrics.wrongTraditionRetrievalRate, 0);
  assert.equal(result.reviews.filter(row => row.safetyResult === 'crisis_intercepted').length, 7);
  assert.ok(result.reviews.every(row => row.reviewAccuracy === null));
});

test('evaluation: metrics have explicit denominators and penalize wrong tradition/duplicates', () => {
  const rows = [
    { tradition: 'protestant', expectedSourceIds: ['a', 'b'], retrievedSources: [{ sourceId: 'x', tradition: 'buddhist' }, { sourceId: 'b', tradition: 'protestant' }, { sourceId: 'b', tradition: 'protestant' }] },
    { tradition: 'protestant', expectedSourceIds: ['a'], retrievedSources: [] },
  ];
  const metrics = retrievalMetrics(rows, 3);
  assert.equal(metrics.recallAtK, 0.25); assert.equal(metrics.precisionAtK, 1 / 6);
  assert.equal(metrics.mrr, 0.25); assert.equal(metrics.wrongTraditionRetrievalRate, 1 / 3);
  assert.equal(metrics.emptyRetrievalRate, 0.5);
  const review = createResponseReview({ question: 'synthetic', tradition: 'protestant', retrievedSources: [] });
  assert.equal(review.answer, null); assert.equal(review.reviewStatus, 'pending_human_review');
});
