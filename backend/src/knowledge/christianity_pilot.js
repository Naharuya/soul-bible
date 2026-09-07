import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { intakeSourceSchema, registerSource, validateExpertRegistry, reviewTemplate } from './expert_registry.js';
import { contentChecksum } from './production_guard.js';
import { normalizeSource } from './ingestion/normalization.js';
import { expertPackage, packageCsv } from './expert_package.js';
import { createProductionIndex } from './production_index.js';
import { checkProductionReadiness } from './production_readiness.js';
import { evaluatePilot, releaseDecision, humanResponseTemplate } from '../evaluation/pilot_evaluation.js';
import { criticalSafetySuite } from '../evaluation/critical_safety.js';

export const christianityMetadataSchema = intakeSourceSchema.omit({ text: true, checksum: true }).extend({
  tradition: z.literal('protestant'), licenseEvidence: z.string().trim().min(1).max(4000),
  reviewStatus: z.literal('candidate').default('candidate'),
}).strict();
function requireChristianity(registry) {
  if (registry.environment !== 'production' || registry.sources.some(source => source.tradition !== 'protestant')) throw new Error('Christianity pilot requires a production protestant-only registry.');
}
export function intakeChristianity(registry, metadata, suppliedText) {
  requireChristianity(registry);
  const { reviewStatus, ...fields } = christianityMetadataSchema.parse(metadata);
  if (typeof suppliedText !== 'string' || !suppliedText.trim()) throw new Error('Operator-supplied local text is required.');
  const text = normalizeSource({ text: suppliedText }).text.trim();
  // Never download or fill content. Full role review remains mandatory after intake.
  return registerSource(registry, { ...fields, text, checksum: contentChecksum(text) });
}
export async function christianityPilotReport({ registry: input, roster, questions, index,
  answers = [], humanReviews = [], regression = {}, rollback = {} }) {
  const registry = validateExpertRegistry(input, roster);
  requireChristianity(registry);
  const approvedSources = registry.sources.filter(source => source.reviewStatus === 'approved').length;
  const pilot = await evaluatePilot({ registry, roster, questions, answers });
  const criticalSafety = await criticalSafetySuite(questions);
  const readiness = await checkProductionReadiness({ index, traditions: ['protestant'] });
  const release = releaseDecision({ regression, rollback, readiness, criticalSafety, pilot, traditions: ['protestant'], humanReviews });
  release.checks.phase8Regression = regression.phase8Baseline === 231 && Number.isInteger(regression.phase8AddedTests)
    && regression.phase8AddedTests >= 7 && regression.total === 231 + regression.phase8AddedTests;
  if (!release.checks.phase8Regression) release.status = 'BLOCKED_RELEASE';
  const manifest = readiness.activeIndexes.protestant;
  const state = await index.registry();
  const indexVersions = Object.entries(state.indexes).filter(([, value]) => value.tradition === 'protestant')
    .map(([indexVersion, value]) => ({ indexVersion, status: value.status }));
  return { summary: { pilotTradition: 'Christianity', tradition: 'protestant', namespace: 'christianity',
    registeredSources: registry.sources.length, approvedSources, blockedSources: registry.sources.length - approvedSources,
    reviewStates: registry.sources.map(source => ({ sourceId: source.sourceId, status: source.reviewStatus, completedRoles: source.reviews.map(review => review.role) })),
    actualCorpusApproval: approvedSources ? 'APPROVED_CORPUS_PRESENT' : 'BLOCKED_EXTERNAL_REVIEW',
    evaluationStatus: pilot.traditions.protestant.status,
    corpusVersion: manifest?.corpusVersion ?? null, indexVersion: manifest?.indexVersion ?? null, indexVersions,
    retrievalBenchmark: pilot.traditions.protestant.strategies ?? { keyword: null, vector: null, hybrid: null },
    citationStatus: pilot.traditions.protestant.strategies?.keyword?.citationPassRate == null ? 'NOT_RUN' : 'EVALUATED',
    crisis: { status: criticalSafety.status, passed: criticalSafety.passed, total: criticalSafety.total },
    tests: regression, rollback, release: release.status, externalApiCalls: 0,
    productionDefault: 'keyword', hybrid: 'experimental',
  }, pilot, criticalSafety, readiness, release, package: expertPackage(registry) };
}

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function christianityPilotCommand(args) {
  const [command, ...options] = args;
  const required = { intake: ['registry', 'metadata', 'text', 'output'],
    report: ['registry', 'roster', 'gold', 'root', 'output'] };
  const optional = command === 'report' ? ['answers', 'human-reviews', 'regression', 'rollback'] : [];
  if (!required[command]) throw new Error('Expected intake or report.');
  const values = {};
  for (let i = 0; i < options.length; i += 2) {
    const flag = options[i], key = flag?.slice(2), value = options[i + 1];
    if (!flag.startsWith('--') || ![...required[command], ...optional].includes(key) || Object.hasOwn(values, key) || !value || value.startsWith('--')) throw new Error('Invalid pilot CLI option.');
    values[key] = value;
  }
  if (required[command].some(key => !values[key])) throw new Error('Missing pilot CLI option.');
  const registry = await readJson(values.registry);
  if (command === 'intake') {
    const result = intakeChristianity(registry, await readJson(values.metadata), await readFile(values.text, 'utf8'));
    await writeFile(values.output, JSON.stringify(result, null, 2), { flag: 'wx' });
    return { registeredSources: result.sources.length, reviewStatus: 'candidate' };
  }
  const result = await christianityPilotReport({ registry, roster: await readJson(values.roster), questions: await readJson(values.gold),
    index: createProductionIndex(values.root), answers: values.answers ? await readJson(values.answers) : [],
    humanReviews: values['human-reviews'] ? await readJson(values['human-reviews']) : [],
    regression: values.regression ? await readJson(values.regression) : {}, rollback: values.rollback ? await readJson(values.rollback) : {} });
  // A new report directory avoids mixing evidence from different operational runs.
  await mkdir(values.output, { recursive: false });
  const files = { 'summary.json': result.summary, 'pilot-evaluation.json': result.pilot,
    'critical-safety.json': result.criticalSafety, 'readiness.json': result.readiness, 'release-gate.json': result.release,
    'expert-package.json': result.package, 'review-template.json': reviewTemplate('protestant'),
    'review-submission.json': { environment: result.package.environment, registryFingerprint: result.package.registryFingerprint,
      decisions: result.package.rows.map(row => row.nextReview).filter(Boolean) },
    'human-response-review.json': result.pilot.humanReviews, 'human-response-template.json': humanResponseTemplate() };
  for (const [name, value] of Object.entries(files)) await writeFile(join(values.output, name), JSON.stringify(value, null, 2), { flag: 'wx' });
  await writeFile(join(values.output, 'expert-package.csv'), packageCsv(result.package), { flag: 'wx' });
  return result.summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await christianityPilotCommand(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2));
    if (result.release === 'BLOCKED_RELEASE') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
