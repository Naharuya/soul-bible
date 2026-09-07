import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProductionIndex, activeIndexStore, validateIndexSnapshot } from '../src/knowledge/production_index.js';
import { contentChecksum, reviewCorpusSource, productionEligible, approvalFingerprint } from '../src/knowledge/production_guard.js';
import { checkProductionReadiness, checkCorpusReadiness, productionConfiguration } from '../src/knowledge/production_readiness.js';
import { productionCommand } from '../src/knowledge/production_cli.js';
import { reviewCorpusCommand } from '../src/knowledge/corpus_review_cli.js';
import { createReligionKnowledgeProvider } from '../src/knowledge/provider.js';
import { createRetrievalStrategy } from '../src/knowledge/retrieval_strategy.js';
import { createConversationService } from '../src/conversation_service.js';
import { createApp } from '../src/app.js';
import { responseSchema } from '../src/schema.js';
import { psychologyOutput, religionOutput } from './fixtures/agent_outputs.js';

// Synthetic self-authored fixtures only; never exported to a production directory.
function candidate() {
  const text = '위로가 필요할 때 잠시 쉬어 보셔도 괜찮습니다.';
  return { sourceId: 'protestant:deployment-fixture:1', tradition: 'protestant', sourceType: 'pastoral',
    title: '합성 테스트 자료', reference: '합성 테스트 1', text, language: 'ko-KR', authorityLevel: 'secondary',
    metadata: { sample: false, license: 'Synthetic test fixture', licenseStatus: 'self_authored',
      licenseNote: 'Only for isolated automated tests', publisher: 'Mock fixture author', sourceUrl: 'https://example.invalid/test',
      provenance: 'Synthetic test fixture', importedAt: '2026-01-01T00:00:00.000Z', originalLanguage: 'ko-KR', contentLanguage: 'ko-KR',
      traditionBranch: 'general', qualityScore: 0.8, sourceVersion: '1', checksum: contentChecksum(text),
      keywords: ['위로'], reviewStatus: 'development' } };
}
function approved() {
  return ['candidate', 'reviewed', 'approved'].reduce((record, status) => reviewCorpusSource(record, { status, reviewer: 'mock-reviewer', notes: 'Synthetic fixture only' }), candidate());
}
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'soul-index-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, index: createProductionIndex(root) };
}
const build = (index, id, records = [approved()]) => index.build({ indexVersion: id, corpusVersion: id, tradition: 'protestant', records });
const ready = index => checkProductionReadiness({ index, traditions: ['protestant'] });
const quiet = { info() {}, warn() {}, error() {} };
const body = { session: { sessionId: 'production-deployment-fixture', selectedEmotion: '불안', emotionIntensity: 6, turnCount: 1 },
  userMessage: '기독교 위로', systemPromptVersion: 'ko-v1', allowedVerseIds: [] };

test('review workflow: version, notes and invalidation survive review cycles', () => {
  const source = approved();
  assert.equal(source.metadata.approvalVersion, 1);
  assert.equal(source.metadata.reviewedBy, 'mock-reviewer');
  assert.equal(source.metadata.reviewNotes, 'Synthetic fixture only');
  assert.ok(productionEligible(source));
  for (const mutate of [r => { r.text += '변경'; r.metadata.checksum = contentChecksum(r.text); },
    r => { r.metadata.publisher = 'Changed'; }, r => { r.metadata.sourceVersion = '2'; }, r => { r.metadata.traditionBranch = 'Reformed'; }]) {
    const changed = structuredClone(source); mutate(changed);
    assert.notEqual(approvalFingerprint(changed), source.metadata.approvalFingerprint);
    assert.equal(productionEligible(changed), false);
  }
  const renewed = ['rejected', 'candidate', 'reviewed', 'approved'].reduce((record, status) => reviewCorpusSource(record, { status, reviewer: 'mock-reviewer' }), source);
  assert.equal(renewed.metadata.approvalVersion, 2);
});

test('review workflow: edits after review cannot receive approval without re-review', () => {
  const reviewed = ['candidate', 'reviewed'].reduce((record, status) => reviewCorpusSource(record, { status, reviewer: 'mock-reviewer' }), candidate());
  reviewed.metadata.publisher = 'Changed publisher';
  assert.throws(() => reviewCorpusSource(reviewed, { status: 'approved', reviewer: 'mock-reviewer' }), /changed after review/);
});

test('review CLI: explicit transitions create new files and never overwrite the source', async t => {
  const { root } = await workspace(t);
  let input = join(root, 'development.json');
  await writeFile(input, JSON.stringify([candidate()]));
  for (const status of ['candidate', 'reviewed', 'approved']) {
    const output = join(root, `${status}.json`);
    const report = await reviewCorpusCommand(['--input', input, '--output', output, '--status', status, '--reviewer', 'mock-reviewer']);
    assert.equal(report[0].reviewStatus, status);
    input = output;
  }
  assert.equal(JSON.parse(await readFile(join(root, 'development.json'), 'utf8'))[0].metadata.reviewStatus, 'development');
  assert.equal((await reviewCorpusCommand(['--input', input, '--verify-production']))[0].approvalVersion, 1);
});

test('index: manifest, immutable versions and validated-only activation', async t => {
  const { index } = await workspace(t);
  const manifest = await build(index, 'v1');
  assert.equal(manifest.sourceCount, 1); assert.equal(manifest.embeddingProvider, 'none');
  assert.equal(await index.resolveActive('protestant'), null);
  assert.equal((await index.registry()).indexes.v1.status, 'validated');
  await assert.rejects(index.activate('missing'));
  await assert.rejects(build(index, 'v1'));
  await index.activate('v1');
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
  for (const change of [{ sourceCount: 2 }, { tradition: 'buddhist' }, { corpusFingerprint: '0'.repeat(64) }, { buildStatus: 'building' }, { embeddingVersion: 'invented' }]) {
    const data = await index.snapshot('v1'); Object.assign(data.manifest, change);
    assert.throws(() => validateIndexSnapshot(data));
  }
  await assert.rejects(build(index, '../escape'));
});

test('index: failed build preserves active pointer and records failed state', async t => {
  const { index } = await workspace(t);
  await build(index, 'good'); await index.activate('good');
  await assert.rejects(build(index, 'bad', [candidate()]));
  await assert.rejects(index.activate('bad'));
  assert.equal((await index.registry()).indexes.bad.status, 'failed');
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'good');
});

test('index: activation revalidates snapshot, failed activation keeps old index', async t => {
  const { root, index } = await workspace(t);
  await build(index, 'old'); await index.activate('old'); await build(index, 'new');
  const data = await index.snapshot('new'); data.records[0].text += 'tamper';
  await writeFile(join(root, 'new.json'), JSON.stringify(data));
  await assert.rejects(index.activate('new'));
  assert.equal((await index.registry()).indexes.new.status, 'failed');
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'old');
});

test('index: rollback restores prior validated snapshot and persists across restart', async t => {
  const { root, index } = await workspace(t);
  await assert.rejects(index.rollback('protestant'));
  await build(index, 'v1'); await index.activate('v1');
  await build(index, 'v2'); await index.activate('v2');
  assert.equal((await index.registry()).indexes.v1.status, 'retired');
  await createProductionIndex(root).rollback('protestant');
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
  assert.equal((await index.registry()).indexes.v2.status, 'retired');
  const damaged = await index.snapshot('v2'); damaged.records[0].text += 'tamper';
  await writeFile(join(root, 'v2.json'), JSON.stringify(damaged));
  await assert.rejects(index.rollback('protestant'));
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
});

test('index: concurrent writer lock rejects mutation without changing active state', async t => {
  const { root, index } = await workspace(t);
  await build(index, 'v1'); await index.activate('v1');
  await writeFile(join(root, 'writer.lock'), 'test lock');
  await assert.rejects(build(index, 'v2'), { code: 'EEXIST' });
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
});

test('readiness: empty corpus, pending approval, license and provenance failures', () => {
  assert.equal(checkCorpusReadiness([], 'protestant')[0].status, 'BLOCKED_NO_APPROVED_CORPUS');
  assert.equal(checkCorpusReadiness([candidate()], 'protestant')[0].status, 'BLOCKED_NO_APPROVED_CORPUS');
  const license = approved(); license.metadata.licenseStatus = 'unknown';
  assert.equal(checkCorpusReadiness([license], 'protestant')[0].status, 'BLOCKED_LICENSE');
  const provenance = approved(); delete provenance.metadata.publisher;
  assert.equal(checkCorpusReadiness([provenance], 'protestant')[0].status, 'BLOCKED_PROVENANCE');
  const changed = approved(); changed.metadata.sourceVersion = 'changed';
  assert.equal(checkCorpusReadiness([changed], 'protestant')[0].status, 'BLOCKED_NO_APPROVED_CORPUS');
  assert.equal(checkCorpusReadiness([approved()], 'buddhist')[0].status, 'BLOCKED_INDEX');
});

test('readiness: requires active validated index and all three validators', async t => {
  const { root, index } = await workspace(t);
  assert.equal((await ready(index)).status, 'BLOCKED_NO_APPROVED_CORPUS');
  await build(index, 'v1');
  assert.equal((await ready(index)).status, 'BLOCKED_INDEX');
  await index.activate('v1'); assert.equal((await ready(index)).status, 'READY');
  assert.equal((await checkProductionReadiness({ index, traditions: ['protestant'], validators: {} })).status, 'BLOCKED_VALIDATION');
  const state = await index.registry(); state.indexes.v1.status = 'building';
  await writeFile(join(root, 'registry.json'), JSON.stringify(state));
  await assert.rejects(index.activate('v1'), /Only validated/);
  assert.equal((await ready(index)).status, 'BLOCKED_INDEX');
});

test('readiness: corrupted active license reports explicit license blocker', async t => {
  const { root, index } = await workspace(t);
  await build(index, 'v1'); await index.activate('v1');
  const data = await index.snapshot('v1'); data.records[0].metadata.licenseStatus = 'unknown';
  await writeFile(join(root, 'v1.json'), JSON.stringify(data));
  assert.equal((await ready(index)).status, 'BLOCKED_LICENSE');
});

test('index CLI: build/activate/readiness/status and invalid options', async t => {
  const { root } = await workspace(t);
  const input = join(root, 'input.json'); await writeFile(input, JSON.stringify([approved()]));
  await productionCommand(['build', '--root', root, '--input', input, '--version', 'cli-v1', '--corpus-version', 'c1', '--tradition', 'protestant']);
  await productionCommand(['activate', '--root', root, '--version', 'cli-v1']);
  assert.equal((await productionCommand(['readiness', '--root', root, '--tradition', 'protestant'])).status, 'READY');
  assert.equal((await productionCommand(['status', '--root', root])).active.protestant, 'cli-v1');
  await assert.rejects(productionCommand(['activate', '--root', root]));
  await assert.rejects(productionCommand(['readiness', '--root', root, '--unknown', 'x']));
});

test('deployment: active index resolution, namespace isolation and hybrid keyword fallback', async t => {
  const { index } = await workspace(t);
  await build(index, 'v1'); await index.activate('v1');
  const store = activeIndexStore(index);
  const provider = createReligionKnowledgeProvider({ store, mode: 'production' });
  assert.equal((await provider.search({ tradition: 'protestant', query: '위로' })).results.length, 1);
  assert.deepEqual((await provider.search({ tradition: 'buddhist', query: '위로' })).results, []);
  const retrieval = createRetrievalStrategy({ strategy: 'hybrid', embeddingProvider: { embed: async () => { throw new Error('offline'); } } });
  const result = await retrieval.retrieve({ records: [approved()], tradition: 'protestant', query: '위로', language: 'ko-KR', limit: 3 });
  assert.equal(result.diagnostics.retrievalMode, 'keyword_fallback');
  assert.equal(result.records.length, 1);
});

test('deployment: production config defaults keyword and hybrid requires explicit experimental flag', () => {
  const baseline = productionConfiguration({ NODE_ENV: 'production', SOUL_CORPUS_MODE: 'development', SOUL_EXTERNAL_API_DISABLED: 'true' });
  assert.equal(baseline.corpusMode, 'production'); assert.equal(baseline.externalApiDisabled, true);
  assert.equal(baseline.retrievalMode, 'keyword');
  const experiment = productionConfiguration({ NODE_ENV: 'production', SOUL_HYBRID_EXPERIMENTAL: 'true' });
  assert.equal(experiment.retrievalMode, 'hybrid'); assert.equal(experiment.productionDefault, 'keyword');
});

test('deployment: external API disabled and multi-agent false serve local HTTP contract', async t => {
  const { root } = await workspace(t);
  for (const flags of [{ SOUL_EXTERNAL_API_DISABLED: 'true', SOUL_MULTI_AGENT_ENABLED: 'true' }, { SOUL_MULTI_AGENT_ENABLED: 'false' }]) {
    const generate = createConversationService({ logger: quiet,
      env: { NODE_ENV: 'production', SOUL_AI_MODE: 'openai', OPENAI_API_KEY: 'mock-only', SOUL_PRODUCTION_INDEX_DIR: root, ...flags },
      openAiFactory: () => assert.fail('External client must not be created') });
    const app = createApp({ generate, memberStore: {}, logger: quiet });
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 200); responseSchema.parse(await response.json());
    } finally { await new Promise(resolve => server.close(resolve)); }
  }
});

test('deployment: service uses active index; safety preempts model and retrieval', async t => {
  const { root, index } = await workspace(t);
  await build(index, 'v1'); await index.activate('v1');
  const logs = [], calls = [];
  const generate = createConversationService({ env: { NODE_ENV: 'production', SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'mock-only', SOUL_PRODUCTION_INDEX_DIR: root },
    logger: { ...quiet, info: (_, row) => logs.push(row) }, openAiFactory: () => ({ runStructured: async task => { calls.push(task.name); return task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput(); } }) });
  responseSchema.parse(await generate(body));
  assert.equal(logs[0].retrievalMode, 'keyword');
  assert.ok(logs[0].selectedSourceIds.includes(approved().sourceId));
  calls.length = 0;
  const crisis = await generate({ ...body, userMessage: '죽고 싶어요' });
  responseSchema.parse(crisis); assert.equal(calls.length, 0);
  assert.equal(logs[1].knowledgeSearchCount, 0);
});
