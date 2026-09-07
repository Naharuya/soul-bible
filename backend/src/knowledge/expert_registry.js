import { z } from 'zod';
import { religionIds, religionSchema } from '../agents/agent_contracts.js';
import { contentChecksum, corpusPolicy } from './production_guard.js';
import { normalizeSource } from './ingestion/normalization.js';
import { reviewRoles, fieldsByRole } from './expert_roles.js';
export { reviewRoles } from './expert_roles.js';

const focus = {
  protestant: '개신교: 지정 교단·번역본·목회적 해석의 범위를 확인',
  catholic: '가톨릭: 문헌의 권위와 교구·수도회 등 적용 범위를 확인',
  buddhist: '불교: 지정 종파·전승·번역 및 해설의 구분을 확인',
  jewish: '유대교: 지정 전통·학파 및 원문과 해설의 구분을 확인',
  islamic: '이슬람: 지정 전통·법학파 및 원문·번역·주석의 구분을 확인',
  hindu: '힌두교: 지정 전통·학파와 텍스트의 적용 범위를 확인',
  confucian: '유교: 지정 학파·시대 및 경전과 주석의 구분을 확인',
};
export function reviewTemplate(tradition) {
  religionSchema.parse(tradition);
  return { version: 'expert-v1', tradition, focus: focus[tradition],
    roles: Object.fromEntries(reviewRoles.map(role => [role, { checklist: fieldsByRole[role], decision: null, notes: '' }])) };
}
const text = z.string().trim().min(1);
const timestamp = z.string().datetime().refine(value => Date.parse(value) <= Date.now(), 'Future timestamp');
const environment = z.enum(['production', 'test_fixture']);
export const intakeSourceSchema = z.object({
  sourceId: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,127}$/), tradition: religionSchema,
  traditionBranch: text.max(100), title: text.max(200), publisher: text.max(200), institution: z.string().max(200),
  sourceType: text.max(80), sourceUrl: z.string().url().refine(value => /^https?:\/\//.test(value)),
  language: text.max(20), originalLanguage: text.max(20),
  licenseStatus: z.enum(['public_domain', 'official_permission', 'licensed', 'self_authored', 'restricted', 'unknown']),
  licenseEvidence: z.string().max(4000), provenance: text.max(1000), sourceVersion: text.max(100),
  checksum: z.string().regex(/^[a-f0-9]{64}$/), text: text.max(100000), reference: text.max(200),
  authorityLevel: z.enum(['primary', 'official', 'scholarly', 'secondary']), expectedUsage: text.max(1000),
  keywords: z.array(text.max(80)).max(20), qualityScore: z.number().min(0).max(1),
}).strict();
const decisionSchema = z.object({ sourceId: text, sourceFingerprint: z.string().length(64), role: z.enum(reviewRoles),
  reviewer: text.max(100), reviewedAt: timestamp, decision: z.enum(['approved', 'rejected']),
  notes: text.max(1000), checklist: z.record(z.boolean()) }).strict();
const entrySchema = z.object({ ...intakeSourceSchema.shape,
  reviewStatus: z.enum(['candidate', 'license_verified', 'content_reviewed', 'tradition_reviewed', 'approved', 'rejected']),
  reviewedBy: z.string().nullable(), reviewedAt: timestamp.nullable(), reviewNotes: z.string(),
  reviews: z.array(decisionSchema).max(4),
}).strict();
export const sourceRegistrySchema = z.object({ schemaVersion: z.literal(1), environment,
  sources: z.array(entrySchema).max(1000) }).strict();
export const reviewerRosterSchema = z.object({ environment, reviewers: z.array(z.object({
  id: text.max(100), roles: z.array(z.enum(reviewRoles)).min(1), traditions: z.array(religionSchema).min(1),
  identityEvidence: text.max(1000),
}).strict()) }).strict();
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const registryFingerprint = registry => contentChecksum(JSON.stringify(stable(sourceRegistrySchema.parse(registry))));
function sourceFields(entry) { return intakeSourceSchema.parse(Object.fromEntries(Object.keys(intakeSourceSchema.shape).map(key => [key, entry[key]]))); }
export const intakeFingerprint = (entry, scope) => contentChecksum(JSON.stringify(stable({ environment: scope, source: sourceFields(entry) })));
export const emptyRegistry = (scope = 'production') => sourceRegistrySchema.parse({ schemaVersion: 1, environment: scope, sources: [] });

export function registerSource(registry, input) {
  const result = sourceRegistrySchema.parse(registry);
  const source = intakeSourceSchema.parse(normalizeSource(input));
  if (source.checksum !== contentChecksum(source.text)) throw new Error('Checksum must match normalized source text.');
  if (result.sources.some(entry => entry.sourceId === source.sourceId)) throw new Error('Source ID already registered; revise explicitly.');
  result.sources.push({ ...source, reviewStatus: 'candidate', reviewedBy: null, reviewedAt: null, reviewNotes: '', reviews: [] });
  return result;
}
export function reviseSource(registry, input) {
  const previous = sourceRegistrySchema.parse(registry);
  const old = previous.sources.find(source => source.sourceId === input.sourceId);
  if (!old || old.sourceVersion === input.sourceVersion) throw new Error('Revision requires existing ID and new sourceVersion.');
  return registerSource({ ...previous, sources: previous.sources.filter(source => source.sourceId !== input.sourceId) }, input);
}
function applyDecision(entry, raw, scope, roster) {
  const decision = decisionSchema.parse(raw);
  if (entry.reviewStatus === 'approved' || entry.reviewStatus === 'rejected'
      || decision.sourceId !== entry.sourceId || decision.sourceFingerprint !== intakeFingerprint(entry, scope)
      || entry.checksum !== contentChecksum(entry.text)) throw new Error('Stale, changed or terminal source review.');
  if (decision.role !== reviewRoles[entry.reviews.length]) throw new Error('Review roles must follow license/content/tradition/safety order.');
  const actor = roster.reviewers.find(reviewer => reviewer.id === decision.reviewer);
  if (!actor?.roles.includes(decision.role) || !actor.traditions.includes(entry.tradition)) throw new Error('Reviewer is not authorized for this role/tradition.');
  if (entry.reviewedAt && Date.parse(decision.reviewedAt) < Date.parse(entry.reviewedAt)) throw new Error('Review chronology is invalid.');
  const keys = fieldsByRole[decision.role];
  if (Object.keys(decision.checklist).length !== keys.length || keys.some(key => typeof decision.checklist[key] !== 'boolean')) throw new Error('Incomplete review checklist.');
  if (decision.decision === 'approved') {
    if (keys.some(key => !decision.checklist[key])) throw new Error('Approval requires all checklist items.');
    if (!corpusPolicy(entry.tradition).licenseRequirements.allowed.includes(entry.licenseStatus) || !entry.licenseEvidence.trim()) throw new Error('License verification blocked.');
    if (!corpusPolicy(entry.tradition).allowedSourceTypes.includes(entry.sourceType)) throw new Error('Source type outside tradition policy.');
  }
  return { ...entry, reviews: [...entry.reviews, decision], reviewedBy: decision.reviewer,
    reviewedAt: decision.reviewedAt, reviewNotes: decision.notes,
    reviewStatus: decision.decision === 'rejected' ? 'rejected' : ['license_verified', 'content_reviewed', 'tradition_reviewed', 'approved'][entry.reviews.length] };
}
export function validateExpertRegistry(input, rosterInput) {
  const registry = sourceRegistrySchema.parse(input), roster = reviewerRosterSchema.parse(rosterInput);
  if (registry.environment !== roster.environment || new Set(roster.reviewers.map(row => row.id)).size !== roster.reviewers.length) throw new Error('Invalid reviewer roster scope/duplicates.');
  if (new Set(registry.sources.map(row => row.sourceId)).size !== registry.sources.length) throw new Error('Duplicate registry source.');
  for (const entry of registry.sources) {
    if (entry.checksum !== contentChecksum(entry.text)) throw new Error('Changed source checksum.');
    let replay = { ...entry, reviews: [], reviewStatus: 'candidate', reviewedBy: null, reviewedAt: null, reviewNotes: '' };
    for (const decision of entry.reviews) replay = applyDecision(replay, decision, registry.environment, roster);
    if (JSON.stringify(stable(replay)) !== JSON.stringify(stable(entry))) throw new Error('Review status does not match role evidence.');
  }
  return registry;
}
export function importExpertReviews(input, submission, rosterInput) {
  const registry = validateExpertRegistry(input, rosterInput), roster = reviewerRosterSchema.parse(rosterInput);
  if (submission.environment !== registry.environment || submission.registryFingerprint !== registryFingerprint(registry)
      || !Array.isArray(submission.decisions) || !submission.decisions.length) throw new Error('Stale or empty review submission.');
  for (const decision of submission.decisions) {
    const index = registry.sources.findIndex(entry => entry.sourceId === decision.sourceId);
    if (index < 0) throw new Error('Unknown review source.');
    registry.sources[index] = applyDecision(registry.sources[index], decision, registry.environment, roster);
  }
  return validateExpertRegistry(registry, roster);
}
export function pilotStatus(registry, roster) {
  const checked = validateExpertRegistry(registry, roster);
  return religionIds.map(tradition => ({ tradition, targetChunks: { min: 20, max: 50 },
    approvedSources: checked.sources.filter(source => source.tradition === tradition && source.reviewStatus === 'approved').length,
    status: checked.environment === 'production' && checked.sources.some(source => source.tradition === tradition && source.reviewStatus === 'approved')
      ? 'PENDING_PILOT_BUILD' : 'BLOCKED_EXTERNAL_REVIEW' }));
}
