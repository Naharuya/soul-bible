import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReligionKnowledgeProvider, jsonKnowledgeStore, knowledgeNamespaces } from '../src/knowledge/provider.js';
import { keywordRetriever } from '../src/knowledge/retriever.js';
import { buildSourceContext } from '../src/knowledge/source_context_builder.js';
import { validateCitations } from '../src/agents/citation_validator.js';
import { reviewReligiousIntegrity } from '../src/agents/religious_integrity_agent.js';
import { routeReligion } from '../src/agents/religion_router.js';
import { createConversationOrchestrator } from '../src/agents/conversation_orchestrator.js';
import { createConversationService } from '../src/conversation_service.js';
import { createApp } from '../src/app.js';
import { responseSchema } from '../src/schema.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

const env = { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only' };
const body = (userMessage = '기도', religion) => ({ session: { sessionId: 'rag', selectedEmotion: '불안', emotionIntensity: 6, turnCount: 1 }, userMessage, religion, systemPromptVersion: 'ko-v1', allowedVerseIds: [] });
const search = (tradition = 'protestant', query = '기도') => ({ tradition, query, language: 'ko-KR', limit: 3 });
const quiet = { info() {}, warn() {} };
const provider = createReligionKnowledgeProvider();
const record = (overrides = {}) => ({ sourceId: 'test:1', tradition: 'protestant', sourceType: 'authored_sample', title: '기도 예시', reference: '테스트 자료', text: '기도에 대해 생각할 수 있습니다.', language: 'ko-KR', authorityLevel: 'secondary', metadata: { sample: true, license: 'Original test fixture', keywords: ['기도'] }, ...overrides });
const mockModel = async task => task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput();

for (const [tradition, query] of Object.entries({ protestant: '기독교 기도', catholic: '가톨릭 성사', buddhist: '불교 연기', jewish: '유대교 토라', islamic: '이슬람 꾸란', hindu: '힌두교 다르마', confucian: '유교 효' })) {
  test(`RAG: ${tradition} reads only its namespace and passes full provenance to agent`, async () => {
    const loaded = []; const events = [];
    const kb = createReligionKnowledgeProvider({ store: { async load(namespace, options) {
      loaded.push(namespace); events.push('knowledge'); return jsonKnowledgeStore.load(namespace, options);
    } } });
    const generate = createConversationOrchestrator({ knowledgeProvider: kb, runStructured: async task => {
      events.push(task.name);
      if (task.name === 'psychology_reflection') return psychologyOutput();
      assert.ok(task.input.sourceContext.length > 0);
      for (const source of task.input.sourceContext) {
        assert.equal(source.religion, tradition); assert.equal(source.metadata.sample, true);
        for (const field of ['id', 'sourceType', 'title', 'reference', 'text', 'language', 'authorityLevel']) assert.ok(source[field]);
      }
      return religionOutput({ sourceRefs: [task.input.sourceContext[0].id] });
    } });
    responseSchema.parse(await generate(body(query)));
    assert.deepEqual(loaded, [knowledgeNamespaces[tradition]]);
    assert.deepEqual(events, ['psychology_reflection', 'knowledge', `religion_${tradition}`]);
    const samples = await jsonKnowledgeStore.load(knowledgeNamespaces[tradition]);
    assert.equal(samples.length, 3);
    assert.ok(samples.every(source => source.authorityLevel === 'secondary' && source.metadata.sample));
  });
}

test('RAG: empty query match and unsupported language return no invented evidence', async () => {
  for (const input of [search('buddhist', 'zxqv123'), { ...search(), language: 'en-US' }]) {
    const found = await provider.search(input);
    assert.deepEqual(found.results, []);
    assert.deepEqual(buildSourceContext(found, input), []);
  }
  assert.equal(validateCitations(religionOutput(), { tradition: 'buddhist' }).status, 'no_sources');
});

test('RAG: provider and builder reject cross-tradition, duplicates and forged retriever results', async () => {
  for (const records of [[record({ tradition: 'catholic' })], [record(), record()]]) {
    const kb = createReligionKnowledgeProvider({ store: { load: async () => records } });
    await assert.rejects(kb.search(search()));
  }
  const kb = createReligionKnowledgeProvider({ store: { load: async () => [record()] }, retriever: { rank: async () => [record({ text: '변조된 자료' })] } });
  await assert.rejects(kb.search(search()));
  for (const output of [
    { tradition: 'protestant', query: '기도', results: [record({ tradition: 'catholic' })] },
    { tradition: 'catholic', query: '기도', results: [] },
    { tradition: 'protestant', query: '다른 질문', results: [] },
  ]) assert.throws(() => buildSourceContext(output, search()));
});

test('RAG: authority priority, relevance threshold, deterministic limit and cancellation', async () => {
  const records = ['secondary', 'scholarly', 'official', 'primary'].map((authorityLevel, i) => record({ sourceId: `test:${i}`, authorityLevel }));
  assert.deepEqual(keywordRetriever.rank({ records, query: '기도', limit: 3 }).map(r => r.authorityLevel), ['primary', 'official', 'scholarly']);
  assert.deepEqual(keywordRetriever.rank({ records, query: 'zxqv', limit: 3 }), []);
  await assert.rejects(provider.search({ ...search(), limit: 6 }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(provider.search(search(), { signal: controller.signal }));
});

test('RAG: fake IDs and mixed citation contexts fail closed', () => {
  const source = { id: 'test:1', religion: 'catholic', reference: '테스트', text: '테스트 문장' };
  assert.throws(() => validateCitations(religionOutput({ sourceRefs: ['fake'] }), { tradition: 'protestant' }));
  assert.throws(() => validateCitations(religionOutput({ sourceRefs: ['test:1'] }), { tradition: 'protestant', sourceContext: [source] }));
  assert.throws(() => validateCitations(religionOutput({ perspective: '성경은 위로를 가르칩니다.' }), { tradition: 'protestant' }));
});

test('RAG: nonexistent reference and unsupported strong doctrine are removed then integrity-reviewed', () => {
  const sourceContext = buildSourceContext({ tradition: 'protestant', query: '기도', results: [record()] }, search());
  for (const perspective of ['창세기 999:999를 읽으세요.', '기도는 구원의 유일한 방법입니다.']) {
    const checked = validateCitations(religionOutput({ perspective, sourceRefs: ['test:1'] }), { tradition: 'protestant', sourceContext });
    assert.equal(checked.status, 'repaired');
    assert.deepEqual(checked.output.sourceRefs, []);
    assert.ok(!checked.output.perspective.includes(perspective));
    assert.doesNotThrow(() => reviewReligiousIntegrity(checked.output, { religionAgent: routeReligion(), sourceContext }));
  }
});

test('RAG: exact non-sample evidence may pass, sample text cannot become doctrine', () => {
  const text = '테스트 경전은 성찰을 가르칩니다.';
  const source = { id: 'test:1', religion: 'protestant', reference: '테스트', text };
  const output = religionOutput({ perspective: text, sourceRefs: ['test:1'] });
  assert.equal(validateCitations(output, { tradition: 'protestant', sourceContext: [source] }).status, 'passed');
  assert.equal(validateCitations(output, { tradition: 'protestant', sourceContext: [{ ...source, metadata: { sample: true, license: 'Original', keywords: [] } }] }).status, 'repaired');
});

test('RAG: mixed context skips search; unclear preserves default; crisis precedes search and models', async () => {
  const requests = [];
  const kb = { search: async input => { requests.push(input); return { tradition: input.tradition, query: input.query, results: [] }; } };
  const generate = createConversationOrchestrator({ knowledgeProvider: kb, runStructured: mockModel });
  await generate(body('기독교와 불교')); assert.equal(requests.length, 0);
  await generate(body('마음이 힘들어요')); assert.equal(requests[0].tradition, 'protestant');
  const crisis = createConversationOrchestrator({ knowledgeProvider: { search: () => assert.fail('no retrieval') }, runStructured: () => assert.fail('no model') });
  assert.equal((await crisis(body('죽고 싶어요. 불교가 궁금해요'))).stage, 'crisis');
});

test('RAG: mental health remains ahead of retrieval and religious practice', async () => {
  const steps = [];
  const generate = createConversationOrchestrator({ knowledgeProvider: { async search(input) { steps.push('search'); return provider.search(input); } }, runStructured: async task => {
    steps.push(task.name);
    if (task.name === 'psychology_reflection') return psychologyOutput({ avoid: ['치료 중단'] });
    assert.deepEqual(task.input.psychology.avoid, ['치료 중단']);
    return religionOutput({ guidance: '치료를 계속하면서 원하시면 기도해 보세요.' });
  } });
  assert.match((await generate(body('우울증 치료 중인데 이슬람 기도를 알고 싶어요'))).message, /치료를 계속/);
  assert.deepEqual(steps, ['psychology_reflection', 'search', 'religion_islamic']);
});

test('RAG: retrieval failure uses local fallback with safe telemetry and disabled flag never searches', async () => {
  const logs = [];
  const logger = { info: (_, value) => logs.push(value), warn() {} };
  const broken = { search: async () => { throw Error('private source and user text'); } };
  const generate = createConversationService({ env, logger, knowledgeProvider: broken, openAiFactory: () => ({ runStructured: mockModel }) });
  const input = body('불교 연기');
  responseSchema.parse(await generate(input));
  assert.equal(logs[0].fallbackReason, 'knowledge_retrieval');
  assert.equal(logs[0].knowledgeSearchCount, 1);
  assert.equal(logs[0].routedTradition, 'buddhist');
  assert.ok(!JSON.stringify(logs).includes(input.userMessage));
  const off = createConversationService({ env: { ...env, SOUL_MULTI_AGENT_ENABLED: 'false' }, logger: quiet, knowledgeProvider: { search: () => assert.fail('disabled') }, openAiFactory: () => assert.fail('disabled') });
  const baseline = createConversationService({ env: {}, logger: quiet });
  assert.deepEqual(await off(input), await baseline(input));
});

test('RAG: HTTP contract hides sourceContext and emits selected IDs only in server telemetry', async () => {
  const logs = [];
  const generate = createConversationService({ env, logger: { info: (_, data) => logs.push(data), warn() {} }, openAiFactory: () => ({ runStructured: mockModel }) });
  const app = createApp({ generate, memberStore: {}, logger: { error() {} } });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body('가톨릭 성사')) });
    assert.equal(response.status, 200);
    const json = await response.json(); responseSchema.parse(json);
    assert.equal(json.sourceContext, undefined);
    assert.ok(!JSON.stringify(json).includes('catholic:sample:'));
    assert.deepEqual(logs[0].selectedSourceIds, ['catholic:sample:1']);
    assert.equal(logs[0].citationValidationResult, 'passed');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('RAG: citation repair cannot conceal safety violation; original draft still triggers local fallback', async () => {
  const logs = [];
  const generate = createConversationService({ env, logger: { info: (_, data) => logs.push(data), warn() {} }, openAiFactory: () => ({ runStructured: async task => task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput({ perspective: '경전의 유일한 방법입니다.', guidance: '약을 끊고 기도만 하세요.' }) }) });
  responseSchema.parse(await generate(body()));
  assert.equal(logs[0].fallbackReason, 'religious_integrity');
});

test('RAG: repaired claims reach integration, fake citations reach local fallback', async () => {
  for (const fake of [false, true]) {
    const logs = [];
    const generate = createConversationService({ env, logger: { info: (_, value) => logs.push(value), warn() {} }, openAiFactory: () => ({ runStructured: async task =>
      task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput(fake
        ? { sourceRefs: ['invented:1'] } : { perspective: '경전의 유일한 방법입니다.' }) }) });
    const result = await generate(body('기도'));
    assert.equal(logs[0].citationValidationResult, fake ? 'rejected' : 'repaired');
    assert.equal(logs[0].fallbackReason, fake ? 'religious_integrity' : null);
    if (!fake) assert.match(result.message, /확인된 자료만으로는/);
  }
});

test('RAG: search obeys overall deadline and late completion cannot run religion or update telemetry', async () => {
  let release; let retrievalSignal; const logs = []; const calls = [];
  const pending = new Promise(resolve => { release = resolve; });
  const generate = createConversationService({ env, timeoutMs: 30, logger: { info: (_, data) => logs.push(structuredClone(data)), warn() {} },
    knowledgeProvider: { async search(input, { signal }) { retrievalSignal = signal; await pending; return { tradition: input.tradition, query: input.query, results: [] }; } },
    openAiFactory: () => ({ runStructured: async task => { calls.push(task.name); return psychologyOutput(); } }),
  });
  await generate(body());
  assert.equal(logs[0].fallbackReason, 'timeout');
  assert.equal(retrievalSignal.aborted, true);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['psychology_reflection']);
  assert.equal(logs.length, 1); assert.equal(logs[0].citationValidationResult, 'not_run');
});

test('RAG: concurrent traditions retain separate sources and telemetry', async () => {
  const logs = [];
  const generate = createConversationService({ env, logger: { info: (_, data) => logs.push(data), warn() {} }, openAiFactory: () => ({ runStructured: mockModel }) });
  await Promise.all([generate(body('가톨릭 성사')), generate(body('불교 연기'))]);
  assert.equal(logs.length, 2);
  for (const log of logs) {
    assert.equal(log.knowledgeSearchCount, 1);
    assert.ok(log.selectedSourceIds.length > 0);
    assert.ok(log.selectedSourceIds.every(id => id.startsWith(`${log.routedTradition}:`)));
  }
});
