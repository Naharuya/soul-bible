import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyRegistry, registerSource, reviseSource, reviewTemplate, reviewRoles, registryFingerprint, intakeFingerprint,
  importExpertReviews, validateExpertRegistry, pilotStatus } from '../src/knowledge/expert_registry.js';
import { expertPackage, packageCsv } from '../src/knowledge/expert_package.js';
import { approvedCorpus, buildExpertIndex, citationPayload } from '../src/knowledge/expert_corpus.js';
import { expertCommand } from '../src/knowledge/expert_cli.js';
import { contentChecksum, productionEligible } from '../src/knowledge/production_guard.js';
import { createProductionIndex } from '../src/knowledge/production_index.js';
import { checkProductionReadiness } from '../src/knowledge/production_readiness.js';
import { evaluatePilot, pilotCorpusFingerprint, questionFingerprint, releaseDecision, responseDimensions } from '../src/evaluation/pilot_evaluation.js';
import { criticalSafetySuite } from '../src/evaluation/critical_safety.js';
import { religionIds } from '../src/agents/agent_contracts.js';
import { religionOutput } from './fixtures/agent_outputs.js';

// All content, reviewer identities and model answers in this file are synthetic.
// Production-shaped evidence is confined to test memory and OS temporary directories.
const stamp = '2026-01-01T00:00:00.000Z';
function source(overrides = {}) {
  const text = '위로가 필요할 때 잠시 쉬어 보셔도 괜찮습니다.';
  return { sourceId: 'protestant:expert-fixture:1', tradition: 'protestant', traditionBranch: 'general',
    title: 'Synthetic fixture', publisher: 'Test author', institution: 'Test institution', sourceType: 'pastoral',
    sourceUrl: 'https://example.invalid/synthetic', language: 'ko-KR', originalLanguage: 'ko-KR',
    licenseStatus: 'self_authored', licenseEvidence: 'Synthetic self-authored test evidence; not an actual permission.',
    provenance: 'Automated test fixture only', sourceVersion: '1', checksum: contentChecksum(text), text,
    reference: 'Synthetic fixture 1', authorityLevel: 'secondary', expectedUsage: 'Automated tests only', keywords: ['위로'], qualityScore: 0.8, ...overrides };
}
const roster = (environment = 'production') => ({ environment,
  reviewers: [{ id: 'mock-reviewer', roles: reviewRoles, traditions: religionIds, identityEvidence: 'Mock identity for isolated tests only' }] });
const candidate = (input = source(), environment = 'production') => registerSource(emptyRegistry(environment), input);
function decision(registry, role = reviewRoles[registry.sources[0].reviews.length], extra = {}) {
  const entry = registry.sources[0];
  return { sourceId: entry.sourceId, sourceFingerprint: intakeFingerprint(entry, registry.environment), role,
    reviewer: 'mock-reviewer', reviewedAt: stamp, decision: 'approved', notes: 'Synthetic test decision',
    checklist: Object.fromEntries(reviewTemplate(entry.tradition).roles[role].checklist.map(key => [key, true])), ...extra };
}
function submit(registry, row = decision(registry), reviewers = roster(registry.environment)) {
  return importExpertReviews(registry, { environment: registry.environment, registryFingerprint: registryFingerprint(registry), decisions: [row] }, reviewers);
}
const approved = (registry = candidate()) => reviewRoles.reduce(result => submit(result), registry);
const gold = async () => JSON.parse(await readFile(new URL('../evaluation/gold-candidate-v1.json', import.meta.url), 'utf8'));
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'soul-expert-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, index: createProductionIndex(root) };
}
async function pilotFixture() {
  const registry = approved(), records = approvedCorpus(registry, roster(), 'protestant');
  const original = (await gold()).find(q => q.tradition === 'protestant' && q.split === 'evaluation' && q.category !== 'safety conflict');
  const question = { ...original, question: '위로', labelStatus: 'expert_approved',
    expectedSourceCriteria: { ...original.expectedSourceCriteria, ids: [records[0].sourceId], allowEmpty: false } };
  const answers = ['keyword', 'vector', 'hybrid'].map(strategy => ({ questionId: question.id, strategy,
    corpusFingerprint: pilotCorpusFingerprint(records), questionFingerprint: questionFingerprint(question),
    model: 'synthetic-model-answer', generatedAt: stamp, noAnswer: false,
    output: religionOutput({ sourceRefs: [records[0].sourceId] }) }));
  return { registry, records, questions: [question], roster: roster(), answers };
}

test('expert registry: seven templates expose four distinct ordered role checklists', () => {
  for (const tradition of religionIds) {
    const template = reviewTemplate(tradition);
    assert.equal(template.tradition, tradition); assert.ok(template.focus.length);
    assert.deepEqual(Object.keys(template.roles), reviewRoles);
    for (const role of reviewRoles) assert.ok(template.roles[role].checklist.length >= 3);
  }
});
test('license gate: unknown/restricted/missing evidence cannot pass license verification', () => {
  for (const licenseStatus of ['restricted', 'unknown']) {
    const registry = candidate(source({ licenseStatus }));
    assert.throws(() => submit(registry), /License verification/);
  }
  assert.throws(() => submit(candidate(source({ licenseEvidence: '' }))), /License verification/);
  for (const licenseStatus of ['self_authored', 'public_domain', 'licensed', 'official_permission']) {
    assert.equal(submit(candidate(source({ licenseStatus }))).sources[0].reviewStatus, 'license_verified');
  }
});
test('expert gate: role order, authorized reviewer and all checklist items are required', () => {
  const registry = candidate();
  assert.throws(() => submit(registry, decision(registry, 'traditionExpert')), /order/);
  assert.throws(() => submit(registry, decision(registry, 'licenseReviewer', { reviewer: 'unknown' })), /authorized/);
  assert.throws(() => submit(registry, decision(registry, 'licenseReviewer', { checklist: {} })), /checklist/);
  const content = submit(registry);
  const tradition = submit(content);
  assert.throws(() => submit(tradition, decision(tradition), { environment: 'production', reviewers: [{ ...roster().reviewers[0], roles: ['contentReviewer'] }] }), /authorized/);
});
test('safety gate: partial and rejected source cannot enter production build', () => {
  const partial = ['licenseReviewer', 'contentReviewer', 'traditionExpert'].reduce(result => submit(result), candidate());
  assert.equal(partial.sources[0].reviewStatus, 'tradition_reviewed');
  assert.throws(() => approvedCorpus(partial, roster(), 'protestant'), /BLOCKED_EXTERNAL_REVIEW/);
  const failed = submit(partial, decision(partial, 'safetyReviewer', { decision: 'rejected' }));
  assert.equal(failed.sources[0].reviewStatus, 'rejected');
  assert.throws(() => approvedCorpus(failed, roster(), 'protestant'), /BLOCKED_EXTERNAL_REVIEW/);
  assert.throws(() => submit(failed, decision(failed, 'safetyReviewer')), /terminal/);
});
test('expert import: full four-role evidence is retained and forged status is rejected', () => {
  const registry = approved();
  assert.equal(registry.sources[0].reviewStatus, 'approved');
  assert.deepEqual(registry.sources[0].reviews.map(row => row.role), reviewRoles);
  const forged = candidate(); forged.sources[0].reviewStatus = 'approved';
  assert.throws(() => validateExpertRegistry(forged, roster()), /does not match/);
});
test('expert import: stale package, changed text/metadata and replay require fresh review', () => {
  const registry = candidate(), row = decision(registry);
  const pack = { environment: 'production', registryFingerprint: registryFingerprint(registry), decisions: [row] };
  const changed = structuredClone(registry); changed.sources[0].publisher = 'Changed';
  assert.throws(() => importExpertReviews(changed, pack, roster()), /Stale/);
  assert.throws(() => importExpertReviews(submit(registry), pack, roster()), /Stale/);
  const full = approved(); full.sources[0].text += '변경'; full.sources[0].checksum = contentChecksum(full.sources[0].text);
  assert.throws(() => validateExpertRegistry(full, roster()), /changed/);
  const revised = reviseSource(approved(), source({ sourceVersion: '2' }));
  assert.equal(revised.sources[0].reviewStatus, 'candidate'); assert.deepEqual(revised.sources[0].reviews, []);
});
test('expert fixtures: fixture-scoped approval cannot be imported or built as production', () => {
  const fixture = approved(candidate(source(), 'test_fixture'));
  assert.throws(() => approvedCorpus(fixture, roster('test_fixture'), 'protestant'), /Test fixture/);
  assert.throws(() => validateExpertRegistry(fixture, roster()), /scope/);
  assert.ok(pilotStatus(fixture, roster('test_fixture')).every(row => row.status === 'BLOCKED_EXTERNAL_REVIEW'));
});
test('expert package: text, evidence, role templates and CSV formula protection are exported', () => {
  const pack = expertPackage(candidate(source({ title: '=UNTRUSTED()' })));
  assert.equal(pack.rows[0].sourceText, source().text);
  assert.equal(pack.rows[0].licenseEvidence, source().licenseEvidence);
  assert.equal(pack.rows[0].nextReview.role, 'licenseReviewer');
  assert.ok(pack.rows[0].chunks.length); assert.match(packageCsv(pack), /'=UNTRUSTED/);
  assert.equal(pack.rows[0].reviewDecision, null);
  assert.ok(!Object.hasOwn(pack.rows[0], 'userMessage'));
});
test('approved build: reviewed chunk evidence, immutable version and explicit activation', async t => {
  const { index } = await workspace(t);
  const text = source().text + '\n\n' + '잠시 마음을 돌아보는 합성 문장입니다.';
  const registry = approved(candidate(source({ text, checksum: contentChecksum(text) })));
  const manifest = await buildExpertIndex({ registry, roster: roster(), tradition: 'protestant', index, indexVersion: 'expert-v1', corpusVersion: 'c1' });
  assert.equal(manifest.sourceCount, 2); assert.equal(await index.resolveActive('protestant'), null);
  await index.activate('expert-v1');
  const snapshot = await index.resolveActive('protestant');
  assert.ok(snapshot.records.every(productionEligible));
  for (const record of snapshot.records) {
    assert.equal(record.metadata.expertReview.reviews.length, 4);
    assert.equal(record.text, text.slice(record.metadata.location.start, record.metadata.location.end));
  }
});
test('rebuild and rollback: new approved snapshot replaces only after activation', async t => {
  const { index } = await workspace(t), registry = approved();
  const args = { registry, roster: roster(), tradition: 'protestant', index };
  await buildExpertIndex({ ...args, indexVersion: 'v1', corpusVersion: 'c1' }); await index.activate('v1');
  await buildExpertIndex({ ...args, indexVersion: 'v2', corpusVersion: 'c2' });
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
  await index.activate('v2'); await index.rollback('protestant');
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
});
test('citation payload: only approved retrieved IDs and original metadata are accepted', () => {
  const records = approvedCorpus(approved(), roster(), 'protestant'), id = records[0].sourceId;
  assert.deepEqual(citationPayload(records, [id], 'protestant')[0], { sourceId: id, title: 'Synthetic fixture', reference: 'Synthetic fixture 1', institution: 'Test institution', authorityLevel: 'secondary' });
  assert.throws(() => citationPayload(records, ['invented'], 'protestant'));
  assert.throws(() => citationPayload(records, [id], 'buddhist'));
  assert.throws(() => citationPayload(records, [id, id], 'protestant'));
  records[0].metadata.institution = 'Altered';
  assert.throws(() => citationPayload(records, [id], 'protestant'));
});
test('pilot evaluation: absent corpus remains blocked with null metrics for all traditions', async () => {
  const result = await evaluatePilot({ registry: emptyRegistry(), roster: { environment: 'production', reviewers: [] }, questions: await gold() });
  assert.equal(result.actualCorpusApproval, 'BLOCKED_EXTERNAL_REVIEW');
  assert.equal(Object.keys(result.traditions).length, 7);
  assert.ok(Object.values(result.traditions).every(row => row.metrics === null && row.approvedChunks === 0));
  assert.deepEqual(result.humanReviews, []);
});
test('pilot evaluation: existing sample IDs cannot masquerade as real corpus Gold labels', async () => {
  const result = await evaluatePilot({ registry: approved(), roster: roster(), questions: await gold() });
  assert.equal(result.traditions.protestant.status, 'BLOCKED_GOLD_LABELS');
});
test('pilot evaluation: three retrieval modes and evidence-bound model response review', async () => {
  const fixture = await pilotFixture();
  const result = await evaluatePilot(fixture);
  const evaluated = result.traditions.protestant;
  assert.equal(evaluated.status, 'EVALUATED');
  for (const strategy of ['keyword', 'vector', 'hybrid']) {
    assert.equal(evaluated.strategies[strategy].recallAt1, 1);
    assert.equal(evaluated.strategies[strategy].wrongTraditionRate, 0);
    assert.equal(evaluated.strategies[strategy].citationPassRate, 1);
    assert.equal(evaluated.strategies[strategy].noAnswerRate, 0);
  }
  assert.equal(result.humanReviews.length, 3);
  assert.ok(result.humanReviews.every(row => responseDimensions.every(key => row.scores[key].score === null)));
  fixture.answers[0].corpusFingerprint = '0'.repeat(64);
  await assert.rejects(evaluatePilot(fixture), /Stale model/);
});
test('pilot evaluation: no model answer is not reported as zero abstention or citation success', async () => {
  const fixture = await pilotFixture(); fixture.answers = [];
  const result = await evaluatePilot(fixture);
  assert.equal(result.traditions.protestant.strategies.keyword.noAnswerRate, null);
  assert.equal(result.traditions.protestant.strategies.keyword.citationPassRate, null);
});
test('critical safety: seven cases preempt retrieval/model and a failing pipeline blocks suite', async () => {
  const questions = await gold();
  const good = await criticalSafetySuite(questions);
  assert.equal(good.status, 'PASS'); assert.equal(good.passed, 7);
  assert.ok(good.rows.every(row => row.downstreamCalls === 0));
  const bad = await criticalSafetySuite(questions, { serviceFactory: () => async () => ({}) });
  assert.equal(bad.status, 'BLOCKED_CRITICAL_SAFETY'); assert.equal(bad.failed, 7);
});
test('release gate: corpus, citation, human review, safety and rollback evidence are mandatory', async t => {
  const fixture = await pilotFixture(), { index } = await workspace(t);
  const pilot = await evaluatePilot(fixture);
  await buildExpertIndex({ registry: fixture.registry, roster: fixture.roster, tradition: 'protestant', index, indexVersion: 'v1', corpusVersion: 'c1' });
  await index.activate('v1');
  const input = { regression: { total: 231, passed: 231, failed: 0, skipped: 0, existingBaseline: 211, additionalTests: 20 },
    readiness: await checkProductionReadiness({ index, traditions: ['protestant'] }), pilot,
    criticalSafety: await criticalSafetySuite(await gold()), rollback: { passed: true }, traditions: ['protestant'],
    humanReviews: pilot.humanReviews.map(row => ({ ...row, reviewer: 'mock-reviewer', reviewedAt: stamp,
      scores: Object.fromEntries(responseDimensions.map(key => [key, { score: 5, reviewerNotes: 'Synthetic test rating' }])) })) };
  assert.equal(releaseDecision(input).status, 'RELEASE_CANDIDATE');
  for (const change of [{ criticalSafety: { ...input.criticalSafety, passed: 6 } }, { rollback: { passed: false } },
    { humanReviews: [] }, { readiness: { status: 'BLOCKED_NO_APPROVED_CORPUS' } }, { regression: { total: 211, passed: 210, failed: 1, skipped: 0 } }]) {
    assert.equal(releaseDecision({ ...input, ...change }).status, 'BLOCKED_RELEASE');
  }
});
test('expert CLI: package/import/build run without manual code edits or source overwrite', async t => {
  const { root } = await workspace(t), registryPath = join(root, 'registry.json'), rosterPath = join(root, 'roster.json');
  const registry = candidate();
  await writeFile(registryPath, JSON.stringify(registry)); await writeFile(rosterPath, JSON.stringify(roster()));
  const packageRoot = join(root, 'package');
  await expertCommand(['package', '--registry', registryPath, '--roster', rosterPath, '--output', packageRoot]);
  assert.match(await readFile(join(packageRoot, 'sources.csv'), 'utf8'), /licenseEvidence/);
  const submission = { environment: 'production', registryFingerprint: registryFingerprint(registry), decisions: [decision(registry)] };
  const reviewPath = join(root, 'review.json'); await writeFile(reviewPath, JSON.stringify(submission));
  const output = join(root, 'reviewed-registry.json');
  await expertCommand(['import', '--registry', registryPath, '--roster', rosterPath, '--reviews', reviewPath, '--output', output]);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).sources[0].reviewStatus, 'license_verified');
  assert.equal(JSON.parse(await readFile(registryPath, 'utf8')).sources[0].reviewStatus, 'candidate');
  await assert.rejects(expertCommand(['import', '--registry', registryPath, '--roster', rosterPath, '--reviews', reviewPath, '--output', output]));
  const approvedPath = join(root, 'approved.json'); await writeFile(approvedPath, JSON.stringify(approved()));
  const indexRoot = join(root, 'index');
  const manifest = await expertCommand(['build', '--registry', approvedPath, '--roster', rosterPath,
    '--tradition', 'protestant', '--root', indexRoot, '--version', 'cli-v1', '--corpus-version', 'c1']);
  assert.equal(manifest.sourceCount, 1);
  assert.equal(await createProductionIndex(indexRoot).resolveActive('protestant'), null);
});

test('pilot bounds: oversized corpus is rejected and test-scope evidence fails production guard', () => {
  const text = Array.from({ length: 51 }, (_, index) => `위로를 위한 합성 테스트 문단 ${index}.`).join('\n\n');
  assert.throws(() => approvedCorpus(approved(candidate(source({ text, checksum: contentChecksum(text) }))), roster(), 'protestant'), /exceeds 50/);
  const records = approvedCorpus(approved(), roster(), 'protestant');
  records[0].metadata.expertReview.environment = 'test_fixture';
  assert.equal(productionEligible(records[0]), false);
});

test('pilot citation quality: uncited answers and invented citations cannot appear compliant', async () => {
  const fixture = await pilotFixture();
  fixture.answers[0].output.sourceRefs = [];
  const uncited = await evaluatePilot(fixture);
  assert.equal(uncited.traditions.protestant.strategies.keyword.citationComplianceRate, 0);
  fixture.answers[0].output.sourceRefs = ['invented'];
  const fabricated = await evaluatePilot(fixture);
  assert.equal(fabricated.traditions.protestant.strategies.keyword.citationPassRate, 0);
  assert.equal(fabricated.traditions.protestant.strategies.keyword.integrityPassRate, 0);
});
