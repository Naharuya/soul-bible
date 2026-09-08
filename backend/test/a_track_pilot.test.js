import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicDomainVplAdapter } from '../src/knowledge/bible_corpus_adapter.js';
import { bibleReference, parseBibleReference, bibleReferencesIn } from '../src/knowledge/bible_passage.js';
import { prepareATrack, loadATrackSnapshot, aTrackGold, aTrackCommand } from '../src/knowledge/a_track_pilot.js';
import { emptyRegistry, reviewRoles, reviewTemplate, registryFingerprint, intakeFingerprint, importExpertReviews, validateExpertRegistry } from '../src/knowledge/expert_registry.js';
import { approvedCorpus, buildExpertIndex } from '../src/knowledge/expert_corpus.js';
import { createProductionIndex } from '../src/knowledge/production_index.js';
import { productionEligible, contentChecksum } from '../src/knowledge/production_guard.js';
import { createReligionKnowledgeProvider } from '../src/knowledge/provider.js';
import { createRetrievalStrategy } from '../src/knowledge/retrieval_strategy.js';
import { buildSourceContext } from '../src/knowledge/source_context_builder.js';
import { validateCitations } from '../src/agents/citation_validator.js';
import { referenceMatches } from '../src/agents/citation_grounding.js';
import { applyRetrievalConfidence } from '../src/knowledge/retrieval_confidence.js';
import { evaluatePilot, pilotCorpusFingerprint, questionFingerprint } from '../src/evaluation/pilot_evaluation.js';
import { criticalSafetySuite } from '../src/evaluation/critical_safety.js';
import { engagementEventTypes, createEngagementHooks } from '../src/engagement/domain_events.js';
import { createConversationService } from '../src/conversation_service.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { createApp } from '../src/app.js';
import { responseSchema } from '../src/schema.js';

const directory = fileURLToPath(new URL('../corpus/christianity-a-track/upstream', import.meta.url));
const selectionPath = fileURLToPath(new URL('../corpus/christianity-a-track/selections.json', import.meta.url));
const snapshot = await loadATrackSnapshot(directory, selectionPath);
const prepared = prepareATrack({ ...snapshot, registry: emptyRegistry() });
const gold = aTrackGold(prepared.candidates);
// Mock approvals exist only in this test process or auto-cleaned temporary directories.
// They never update the checked-in registry, roster, review packages or release evidence.
const roster = { environment: 'production', reviewers: [{ id: 'phase9-mock-only', roles: reviewRoles,
  traditions: ['protestant'], identityEvidence: 'AUTOMATED TEST ONLY, not a real expert' }] };
function review(registry, decision = 'approved') {
  const decisions = registry.sources.map(source => {
    const role = reviewRoles[source.reviews.length];
    return { sourceId: source.sourceId, sourceFingerprint: intakeFingerprint(source, registry.environment), role,
      reviewer: 'phase9-mock-only', reviewedAt: '2026-01-01T00:00:00.000Z', decision, notes: 'Automated test decision, never production approval',
      checklist: Object.fromEntries(reviewTemplate('protestant').roles[role].checklist.map(key => [key, true])) };
  });
  return importExpertReviews(registry, { environment: registry.environment, registryFingerprint: registryFingerprint(registry), decisions }, roster);
}
const reviewed = reviewRoles.reduce(result => review(result), prepared.registry);
const records = approvedCorpus(reviewed, roster, 'protestant');
const request = query => ({ tradition: 'protestant', query, language: 'en-US', limit: 3 });
const provider = (strategy = 'keyword') => createReligionKnowledgeProvider({ mode: 'production', store: { load: async () => records }, retriever: createRetrievalStrategy({ strategy }) });
const quiet = { info() {}, warn() {}, error() {} };
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'soul-phase9-test-'));
  t.after(() => rm(root, { recursive: true, force: true })); return root;
}
const contextFor = record => buildSourceContext({ tradition: 'protestant', query: record.reference, results: [record] }, request(record.reference), { mode: 'production' });
const draft = (perspective, sourceRefs) => ({ perspective, guidance: '잠시 마음을 돌보셔도 괜찮습니다.', reflectionQuestion: '지금 필요한 도움은 무엇인가요?', sourceRefs, cautions: [] });

test('A-track source policy rejects unknown/restricted licenses and incomplete evidence before parsing text', () => {
  for (const change of [{ licenseStatus: 'unknown' }, { licenseStatus: 'restricted' }, { licenseStatus: 'self_authored' },
    { licenseEvidence: '' }, { provenance: '' }, { publisher: '' }, { institution: '' }, { sourceVersion: '' }, { sourceUrl: 'file:///tmp/bible' }]) {
    assert.throws(() => new PublicDomainVplAdapter().loadSource(snapshot.bytes, { ...snapshot.metadata, ...change }));
  }
});
test('A-track source checksum rejects edited bytes and clears previously loaded content', () => {
  const adapter = new PublicDomainVplAdapter(); adapter.loadSource(snapshot.bytes, snapshot.metadata);
  assert.throws(() => adapter.loadSource(Buffer.concat([snapshot.bytes, Buffer.from('changed')]), snapshot.metadata), /checksum/);
  assert.throws(() => adapter.createChunks(snapshot.selections), /verified source/);
});
test('A-track evidence verifies downloaded subset, license and selection checksums', async t => {
  const root = await workspace(t); await cp(directory, join(root, 'snapshot'), { recursive: true });
  await writeFile(join(root, 'snapshot', 'engwebp_about.htm'), 'tampered license');
  await assert.rejects(loadATrackSnapshot(join(root, 'snapshot'), selectionPath), /provenance/);
  assert.equal(snapshot.evidence.selectedVerses, 31); assert.equal(snapshot.evidence.candidatePassages, 24);
});
test('A-track contains 24 real candidate passages without invented approval or translated text', () => {
  assert.equal(prepared.candidates.length, 24);
  assert.ok(prepared.registry.sources.every(s => s.reviewStatus === 'candidate' && !s.reviews.length && s.language === 'en-US'));
  for (const source of prepared.candidates) {
    assert.equal(source.checksum, contentChecksum(source.text));
    assert.equal(source.reference, bibleReference(source.passage));
    assert.ok(source.passage.emotionTags.length && source.passage.conceptTags.length);
  }
  assert.ok(prepared.candidates.find(s => s.reference === 'Psalms 56:3').text.includes('afraid'));
});
test('A-track normalizes canonical, Korean and numbered book references without chapter prefix collisions', () => {
  for (const [input, expected] of [['PHI 4:6-7','Philippians 4:6-7'], ['빌립보서 4장 6-7절','Philippians 4:6-7'], ['1JO 1:9','1 John 1:9']]) {
    assert.equal(bibleReference(parseBibleReference(input)), expected);
  }
  assert.deepEqual(bibleReferencesIn('Read 1 John 1:9 and Psalms 56:3.'), ['1 John 1:9', 'Psalms 56:3']);
  assert.throws(() => parseBibleReference('Hezekiah 1:1'));
});
test('A-track adapter rejects missing, overlapping and reversed verse ranges', () => {
  for (const selection of [s => { s[0].chapter = 99; }, s => { s[1] = s[0]; }, s => { s[0].verseEnd = 1; }]) {
    const adapter = new PublicDomainVplAdapter(); adapter.loadSource(snapshot.bytes, snapshot.metadata);
    const selections = structuredClone(snapshot.selections); selection(selections);
    assert.throws(() => adapter.createChunks(selections));
  }
});
test('A-track intake forbids preapproval, duplicate sources and out-of-scope registries', () => {
  assert.throws(() => prepareATrack({ ...snapshot, metadata: { ...snapshot.metadata, reviewStatus: 'approved' }, registry: emptyRegistry() }));
  assert.throws(() => prepareATrack({ ...snapshot, registry: prepared.registry }), /already registered/);
  assert.throws(() => prepareATrack({ ...snapshot, registry: emptyRegistry('test_fixture') }));
});
test('A-track partial or rejected reviews cannot build the pilot index', async t => {
  const index = createProductionIndex(await workspace(t));
  let partial = prepared.registry;
  for (let round = 0; round < 3; round++) {
    partial = review(partial);
    await assert.rejects(buildExpertIndex({ registry: partial, roster, tradition: 'protestant', index, indexVersion: 'blocked', corpusVersion: 'blocked' }), /BLOCKED_EXTERNAL_REVIEW/);
  }
  assert.throws(() => approvedCorpus(review(partial, 'rejected'), roster, 'protestant'), /BLOCKED_EXTERNAL_REVIEW/);
  assert.deepEqual((await index.registry()).indexes, {});
});
test('A-track reviewed tags and passage metadata are bound to source fingerprints', () => {
  for (const mutate of [s => s.passage.emotionTags.push('fear'), s => { s.passage.chapter = 99; }, s => { s.licenseEvidence += 'changed'; }]) {
    const changed = structuredClone(reviewed); mutate(changed.sources[0]);
    assert.throws(() => validateExpertRegistry(changed, roster));
  }
});
test('A-track approved-only build preserves exact passage fields and text in one chunk per source', () => {
  assert.equal(records.length, 24);
  for (const record of records) {
    const source = prepared.candidates.find(s => s.sourceId === record.metadata.originalSourceId);
    assert.equal(record.text, source.text); assert.equal(record.reference, source.reference);
    assert.equal(record.metadata.licenseEvidence, source.licenseEvidence);
    assert.equal(record.metadata.location.unit, 'passage'); assert.ok(productionEligible(record));
    for (const field of Object.keys(source.passage)) assert.deepEqual(record.metadata[field], source.passage[field]);
  }
});
test('A-track test_fixture reviews cannot be repurposed as production approval', () => {
  const fixture = structuredClone(prepared.registry); fixture.environment = 'test_fixture';
  assert.throws(() => approvedCorpus(fixture, { environment: 'test_fixture', reviewers: [] }, 'protestant'), /Test fixture/);
  assert.throws(() => validateExpertRegistry(fixture, roster), /scope/);
});
test('A-track production keyword retrieval connects all eight Korean emotion groups to real tags', async () => {
  for (const q of gold.filter(q => q.category === 'emotion')) {
    const result = await provider().search(request(q.question));
    assert.ok(result.results.length, q.question);
    assert.ok(result.results.every(record => record.metadata.emotionTags.includes(q.expectedEmotionTags[0])), q.question);
  }
});
test('A-track production keyword retrieval connects concept-only questions to passage tags', async () => {
  for (const q of gold.filter(q => q.category === 'concept')) {
    const result = await provider().search(request(q.question));
    assert.ok(result.results.length, q.question);
    assert.ok(result.results.every(record => record.metadata.conceptTags.includes(q.expectedConceptTags[0])), q.question);
  }
});
test('A-track source language remains English; Korean source requests are never silently translated', async () => {
  const found = await provider().search({ ...request('불안'), language: 'ko-KR' });
  assert.deepEqual(found.results, []);
});
test('A-track keyword abstains for unrelated topics and fabricated chapter references', async () => {
  for (const query of ['화성 탐사선의 연료 효율', 'John 99:99', '1 John 1:99', 'Psalms 56:30']) {
    assert.deepEqual((await provider().search(request(query))).results, [], query);
  }
  const found = await provider().search(request('시편 56:3'));
  assert.equal(found.results.length, 1); assert.equal(found.results[0].reference, 'Psalms 56:3');
});
test('A-track citation permits exact original text with its verified book/chapter/verse label', () => {
  const record = records.find(r => r.reference === 'Psalms 56:3');
  assert.equal(validateCitations(draft(`${record.reference}: ${record.text}`, [record.sourceId]), {
    tradition: 'protestant', sourceContext: contextFor(record) }).status, 'passed');
});
test('A-track fake verses and enlarged ranges are repaired even if a semantic evaluator approves', () => {
  const record = records.find(r => r.reference === '1 John 1:9');
  for (const reference of ['John 1:9', '1 John 1:90', '1 John 99:9', '1 John 1:9-10', 'Hezekiah 1:1']) {
    assert.equal(validateCitations(draft(reference, [record.sourceId]), { tradition: 'protestant', sourceContext: contextFor(record),
      evaluator: { evaluate: () => ({ supported: true, exceedsEvidence: false }) } }).status, 'repaired', reference);
  }
});
test('A-track concrete references require sourceContext, sourceId and matching passage metadata', () => {
  const record = records[0];
  assert.throws(() => validateCitations(draft(record.reference, []), { tradition: 'protestant' }));
  assert.throws(() => validateCitations(draft(record.reference, ['fake']), { tradition: 'protestant', sourceContext: contextFor(record) }));
  const context = contextFor(record); context[0].metadata.chapter = 99;
  assert.throws(() => validateCitations(draft(record.reference, [record.sourceId]), { tradition: 'protestant', sourceContext: context }));
  assert.equal(referenceMatches('Philippians 4:6', { ...record, religion: 'protestant' }), false);
});
test('A-track unsupported statements cannot pass by appending a real Bible reference', () => {
  const record = records[0];
  assert.equal(validateCitations(draft(`${record.reference}: This guarantees you will never suffer.`, [record.sourceId]), {
    tradition: 'protestant', sourceContext: contextFor(record) }).status, 'repaired');
});
test('A-track low-confidence claims fall back to empathy without Bible references', () => {
  const output = { tradition: 'protestant', confidence: 0.9, religiousInsight: '1 John 99:99', emotionalSupport: '힘든 마음을 돌봐 주세요.',
    suggestedPractice: { guidance: '구절을 읽어 보세요.', reflectionQuestion: '무엇이 필요한가요?' }, sourceHints: ['fake'], caution: [] };
  const result = applyRetrievalConfidence(output, 0.1);
  assert.deepEqual(result.sourceHints, []); assert.equal(bibleReferencesIn(result.religiousInsight).length, 0);
  assert.equal(result.emotionalSupport, output.emotionalSupport);
});
test('A-track index build is immutable and validation precedes activation', async t => {
  const index = createProductionIndex(await workspace(t));
  const args = { registry: reviewed, roster, tradition: 'protestant', index, indexVersion: 'a1', corpusVersion: 'c1' };
  await buildExpertIndex(args); assert.equal(await index.resolveActive('protestant'), null);
  assert.equal((await index.registry()).indexes.a1.status, 'validated');
  await assert.rejects(buildExpertIndex(args), /already exists/);
  await index.activate('a1'); assert.equal((await index.resolveActive('protestant')).manifest.corpusVersion, 'c1');
});
test('A-track failed replacement preserves active snapshot and rollback restores previous corpus', async t => {
  const root = await workspace(t), index = createProductionIndex(root);
  const args = { registry: reviewed, roster, tradition: 'protestant', index };
  await buildExpertIndex({ ...args, indexVersion: 'a1', corpusVersion: 'c1' }); await index.activate('a1');
  const invalid = structuredClone(records); invalid[0].metadata.verseEnd++;
  await assert.rejects(index.build({ records: invalid, tradition: 'protestant', indexVersion: 'bad', corpusVersion: 'bad' }));
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'a1');
  await buildExpertIndex({ ...args, indexVersion: 'a2', corpusVersion: 'c2' }); await index.activate('a2');
  await createProductionIndex(root).rollback('protestant');
  assert.equal((await index.resolveActive('protestant')).manifest.corpusVersion, 'c1');
});
test('A-track unreviewed real corpus reports no benchmark rather than synthetic success', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No external calls'));
  const result = await evaluatePilot({ registry: prepared.registry, roster: { environment: 'production', reviewers: [] }, questions: gold });
  assert.equal(result.actualCorpusApproval, 'BLOCKED_EXTERNAL_REVIEW');
  assert.deepEqual(result.traditions.protestant.strategies, { keyword: null, vector: null, hybrid: null });
});
test('A-track approved fixture evaluates keyword/vector/hybrid with Precision@3 and emotional alignment', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No external calls'));
  const result = await evaluatePilot({ registry: reviewed, roster, questions: gold });
  const pilot = result.traditions.protestant;
  assert.equal(pilot.status, 'EVALUATED'); assert.equal(pilot.expertGoldApproved, false);
  for (const mode of ['keyword','vector','hybrid']) {
    const metrics = pilot.strategies[mode];
    for (const field of ['recallAt1','recallAt3','recallAt5','precisionAt3','mrr']) assert.ok(metrics[field] >= 0 && metrics[field] <= 1);
    assert.equal(metrics.citationPassRate, null); assert.equal(metrics.noAnswerRate, null);
    assert.equal(metrics.emotionalQueries.length, 13); assert.equal(metrics.queries, 15);
  }
});
test('A-track provided answers measure grounded citations separately from empty retrieval', async () => {
  const record = records.find(r => r.reference === 'Psalms 56:3');
  const question = { ...gold[0], id: 'exact-reference', question: record.reference,
    expectedSourceCriteria: { ids: [record.sourceId], language: 'en-US', allowEmpty: false } };
  const answer = { questionId: question.id, strategy: 'keyword', corpusFingerprint: pilotCorpusFingerprint(records),
    questionFingerprint: questionFingerprint(question), model: 'mock-extractive-test-only', generatedAt: '2026-01-01T00:00:00.000Z',
    output: draft(`${record.reference}: ${record.text}`, [record.sourceId]), noAnswer: false };
  const result = await evaluatePilot({ registry: reviewed, roster, questions: [question], answers: [answer] });
  assert.equal(result.traditions.protestant.strategies.keyword.citationPassRate, 1);
  assert.equal(result.traditions.protestant.strategies.keyword.noAnswerRate, 0);
  assert.equal(result.traditions.protestant.strategies.keyword.precisionAt3, 1 / 3);
});
test('A-track crisis suite keeps all seven safety cases ahead of retrieval and models', async () => {
  const baseline = JSON.parse(await readFile(new URL('../evaluation/gold-candidate-v1.json', import.meta.url), 'utf8'));
  const result = await criticalSafetySuite(aTrackGold(prepared.candidates, baseline));
  assert.equal(result.status, 'PASS'); assert.equal(result.passed, 7);
  assert.ok(result.rows.every(row => row.downstreamCalls === 0));
});
test('A-track engagement hook is disabled by default and has no external effects', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No networking'));
  for (const type of engagementEventTypes) {
    const event = { version: 1, type, eventId: 'test:1', occurredAt: '2026-01-01T00:00:00.000Z', subjectRef: 'opaque:1',
      ...(type === 'seven_day_journey_progress' ? { journeyDay: 1 } : {}) };
    assert.deepEqual(await createEngagementHooks().emit(event), { status: 'disabled' });
  }
});
test('A-track engagement isolates consumer failures and rejects conversation payloads', async () => {
  const input = { version: 1, type: 'verse_saved', eventId: 'test:1', occurredAt: '2026-01-01T00:00:00.000Z', subjectRef: 'opaque:1' };
  const hooks = createEngagementHooks({ onEvent: event => { event.type = 'changed'; } });
  assert.deepEqual(await hooks.emit(input), { status: 'handler_failed' }); assert.equal(input.type, 'verse_saved');
  await assert.rejects(hooks.emit({ ...input, conversationText: 'private' }));
  await assert.rejects(hooks.emit({ ...input, journeyDay: 8 }));
});
test('A-track disabled flag and provider failure preserve local fallback without engagement emissions', async () => {
  const body = { session: { sessionId: 'phase9-local', selectedEmotion: '불안', emotionIntensity: 5, turnCount: 1 },
    userMessage: '오늘 불안해요', systemPromptVersion: 'ko-v1', allowedVerseIds: [], religion: 'protestant' };
  const local = await createConversationService({ env: {}, logger: quiet })(body);
  const disabled = createConversationService({ env: { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'false', OPENAI_API_KEY: 'test-only' },
    logger: quiet, openAiFactory: () => assert.fail('Disabled model'), knowledgeProvider: { search: () => assert.fail('Disabled retrieval') } });
  assert.deepEqual(await disabled(body), local);
  const broken = createConversationService({ env: { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only' },
    logger: quiet, openAiFactory: () => { throw new Error('Simulated outage'); } });
  assert.deepEqual(await broken(body), local); assert.equal(typeof createLocalConversationService(), 'function');
});
test('A-track HTTP regression preserves the public chat schema', async () => {
  const generate = createConversationService({ env: { SOUL_MULTI_AGENT_ENABLED: 'false' }, logger: quiet });
  const app = createApp({ generate, memberStore: {}, logger: quiet });
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  try {
    const body = { session: { sessionId: 'phase9-http', selectedEmotion: '불안', emotionIntensity: 5, turnCount: 1 },
      userMessage: '불안할 때 도움이 필요해요', systemPromptVersion: 'ko-v1', allowedVerseIds: [] };
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); const result = await response.json(); responseSchema.parse(result);
    assert.equal(Object.hasOwn(result, 'engagementEvents'), false); assert.equal(Object.hasOwn(result, 'sourceContext'), false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('A-track prepare CLI produces a reviewable immutable candidate package with pending Gold', async t => {
  const root = await workspace(t), input = join(root, 'registry.json'), output = join(root, 'prepared');
  await writeFile(input, JSON.stringify(emptyRegistry()));
  const args = ['prepare','--registry',input,'--source-dir',directory,'--selections',selectionPath,'--output',output];
  const result = await aTrackCommand(args);
  assert.equal(result.candidateChunks, 24); assert.equal(result.approvedChunks, 0);
  const submissions = JSON.parse(await readFile(join(output, 'review-submission.json'), 'utf8'));
  assert.equal(submissions.decisions.length, 24); assert.ok(submissions.decisions.every(d => d.reviewer === '' && d.decision === null));
  assert.ok(JSON.parse(await readFile(join(output, 'gold-candidate.json'), 'utf8')).every(q => q.labelStatus !== 'expert_approved'));
  await assert.rejects(aTrackCommand(args), { code: 'EEXIST' });
});
