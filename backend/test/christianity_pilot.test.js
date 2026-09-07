import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { intakeChristianity, christianityPilotReport, christianityPilotCommand } from '../src/knowledge/christianity_pilot.js';
import { emptyRegistry, reviewRoles, reviewTemplate, registryFingerprint, intakeFingerprint, importExpertReviews } from '../src/knowledge/expert_registry.js';
import { buildExpertIndex } from '../src/knowledge/expert_corpus.js';
import { createProductionIndex } from '../src/knowledge/production_index.js';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const gold = () => read('../evaluation/gold-candidate-v1.json');
const roster = { environment: 'production', reviewers: [{ id: 'mock-reviewer', roles: reviewRoles,
  traditions: ['protestant'], identityEvidence: 'Isolated automated test only' }] };
async function fixture() {
  // Reuse an existing development sample only inside isolated tests, not pilot data.
  const sample = (await read('../src/knowledge/christianity/samples.json'))[0];
  const metadata = { sourceId: 'protestant:phase8-test:1', tradition: 'protestant', traditionBranch: 'general',
    title: sample.title, publisher: 'Mock fixture author', institution: '', sourceType: 'pastoral',
    sourceUrl: 'https://example.invalid/test-only', language: 'ko-KR', originalLanguage: 'ko-KR',
    licenseStatus: 'self_authored', licenseEvidence: 'Existing development sample; test fixture only',
    provenance: 'Isolated automated test', sourceVersion: '1', reference: sample.reference,
    authorityLevel: 'secondary', expectedUsage: 'Isolated automated test', keywords: sample.metadata.keywords, qualityScore: 0.8 };
  return { metadata, text: sample.text };
}
function review(registry, decision = 'approved') {
  const source = registry.sources[0], role = reviewRoles[source.reviews.length];
  return importExpertReviews(registry, { environment: 'production', registryFingerprint: registryFingerprint(registry),
    decisions: [{ sourceId: source.sourceId, sourceFingerprint: intakeFingerprint(source, 'production'), role,
      reviewer: 'mock-reviewer', reviewedAt: '2026-01-01T00:00:00.000Z', decision, notes: 'Synthetic test decision only',
      checklist: Object.fromEntries(reviewTemplate('protestant').roles[role].checklist.map(key => [key, true])) }] }, roster);
}
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'soul-phase8-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, index: createProductionIndex(join(root, 'index')) };
}

test('Christianity placeholder contains no text and cannot enter registry before operator input', async () => {
  const metadata = await read('../config/christianity-source-metadata.template.json');
  assert.equal(metadata.reviewStatus, 'candidate'); assert.equal(metadata.licenseEvidence, null);
  assert.equal(Object.hasOwn(metadata, 'text'), false);
  assert.throws(() => intakeChristianity(emptyRegistry(), metadata, ''));
});
test('Christianity intake requires license evidence/provenance and forbids preapproval or other traditions', async () => {
  const { metadata, text } = await fixture();
  for (const change of [{ licenseEvidence: '' }, { provenance: '' }, { reviewStatus: 'approved' }, { tradition: 'catholic' }]) {
    assert.throws(() => intakeChristianity(emptyRegistry(), { ...metadata, ...change }, text));
  }
  const registry = intakeChristianity(emptyRegistry(), metadata, text);
  assert.equal(registry.sources[0].reviewStatus, 'candidate');
  assert.deepEqual(registry.sources[0].reviews, []);
});
test('Christianity partial and rejected reviews remain blocked before index build', async t => {
  const { index } = await workspace(t), { metadata, text } = await fixture();
  let registry = intakeChristianity(emptyRegistry(), metadata, text);
  for (let i = 0; i < 3; i++) registry = review(registry);
  const args = { roster, tradition: 'protestant', index, indexVersion: 'v1', corpusVersion: 'c1' };
  await assert.rejects(buildExpertIndex({ ...args, registry }), /BLOCKED_EXTERNAL_REVIEW/);
  await assert.rejects(buildExpertIndex({ ...args, registry: review(registry, 'rejected') }), /BLOCKED_EXTERNAL_REVIEW/);
  assert.equal(await index.resolveActive('protestant'), null);
});
test('Christianity approved versions use validated activation, failed build preservation and rollback', async t => {
  const { index } = await workspace(t), { metadata, text } = await fixture();
  const registry = reviewRoles.reduce(result => review(result), intakeChristianity(emptyRegistry(), metadata, text));
  const args = { registry, roster, tradition: 'protestant', index };
  await buildExpertIndex({ ...args, indexVersion: 'v1', corpusVersion: 'c1' });
  assert.equal((await index.registry()).indexes.v1.status, 'validated');
  assert.equal(await index.resolveActive('protestant'), null); await index.activate('v1');
  const changed = structuredClone(registry); changed.sources[0].publisher += 'changed';
  await assert.rejects(buildExpertIndex({ ...args, registry: changed, indexVersion: 'bad', corpusVersion: 'bad' }));
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
  await buildExpertIndex({ ...args, indexVersion: 'v2', corpusVersion: 'c2' });
  await index.activate('v2'); await index.rollback('protestant');
  assert.equal((await index.resolveActive('protestant')).manifest.indexVersion, 'v1');
});
test('Christianity empty pilot reports zero sources, no benchmark and blocked release without external API', async t => {
  const { index } = await workspace(t);
  t.mock.method(globalThis, 'fetch', () => assert.fail('External calls prohibited'));
  const report = await christianityPilotReport({ registry: emptyRegistry(), roster, questions: await gold(), index });
  assert.equal(report.summary.registeredSources, 0); assert.equal(report.summary.approvedSources, 0);
  assert.equal(report.summary.blockedSources, 0); assert.equal(report.summary.corpusVersion, null);
  assert.equal(report.summary.actualCorpusApproval, 'BLOCKED_EXTERNAL_REVIEW');
  assert.deepEqual(report.summary.retrievalBenchmark, { keyword: null, vector: null, hybrid: null });
  assert.equal(report.summary.crisis.passed, 7); assert.equal(report.summary.release, 'BLOCKED_RELEASE');
  assert.equal(report.release.checks.phase8Regression, false);
  assert.equal(report.package.rows.length, 0);
});
test('Christianity report counts candidate sources as blocked and exports four role inputs', async t => {
  const { index } = await workspace(t), { metadata, text } = await fixture();
  const report = await christianityPilotReport({ registry: intakeChristianity(emptyRegistry(), metadata, text), roster, questions: await gold(), index });
  assert.equal(report.summary.registeredSources, 1); assert.equal(report.summary.blockedSources, 1);
  assert.deepEqual(Object.keys(report.package.rows[0].reviewChecklist.roles), reviewRoles);
  assert.equal(report.package.rows[0].nextReview.role, 'licenseReviewer');
});
test('Christianity CLI creates an immutable report package and leaves index inactive', async t => {
  const { root } = await workspace(t), registryPath = join(root, 'registry.json'), rosterPath = join(root, 'roster.json'), goldPath = join(root, 'gold.json');
  await writeFile(registryPath, JSON.stringify(emptyRegistry())); await writeFile(rosterPath, JSON.stringify(roster));
  await writeFile(goldPath, JSON.stringify(await gold()));
  const output = join(root, 'report');
  const args = ['report', '--registry', registryPath, '--roster', rosterPath, '--gold', goldPath, '--root', join(root, 'index'), '--output', output];
  const result = await christianityPilotCommand(args);
  assert.equal(result.release, 'BLOCKED_RELEASE');
  assert.match(await readFile(join(output, 'expert-package.csv'), 'utf8'), /licenseEvidence/);
  assert.equal(JSON.parse(await readFile(join(output, 'human-response-template.json'), 'utf8')).scores.hallucination.score, null);
  await assert.rejects(christianityPilotCommand(args), { code: 'EEXIST' });
});
