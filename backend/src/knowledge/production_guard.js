import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { knowledgeNamespaces } from './namespaces.js';
import { requireProductionLicense } from './source_quality.js';
import { reviewRoles, fieldsByRole } from './expert_roles.js';
import { assertBiblePassage } from './bible_passage.js';

const policies = new Map();
export function corpusPolicy(tradition) {
  const namespace = knowledgeNamespaces[tradition];
  if (!namespace) throw new Error('Unknown corpus tradition.');
  if (!policies.has(tradition)) policies.set(tradition, JSON.parse(readFileSync(new URL(`../../production-corpus-policy/${namespace}.json`, import.meta.url), 'utf8')));
  return structuredClone(policies.get(tradition));
}
export const contentChecksum = text => createHash('sha256').update(text).digest('hex');
export function approvalFingerprint(record) {
  const { reviewStatus, reviewedBy, reviewedAt, reviewNotes, reviewFingerprint, approvalVersion, approvalFingerprint: ignored, ...provenance } = record.metadata;
  // Sort nested keys so serialization order cannot invalidate an otherwise identical record.
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
  return contentChecksum(JSON.stringify(stable({ ...record, metadata: provenance })));
}
export function validateCandidate(record) {
  assertBiblePassage(record);
  const policy = corpusPolicy(record.tradition);
  requireProductionLicense(record);
  const m = record.metadata;
  if (m.sample || !policy.allowedSourceTypes.includes(record.sourceType)
      || !policy.licenseRequirements.allowed.includes(m.licenseStatus)
      || !(m.publisher?.trim() || m.institution?.trim()) || !m.sourceUrl
      || !/^https?:\/\//.test(m.sourceUrl) || !m.originalLanguage || m.contentLanguage !== record.language
      || !Number.isFinite(Date.parse(m.importedAt)) || Date.parse(m.importedAt) > Date.now()
      || !m.sourceVersion || m.checksum !== contentChecksum(record.text)) throw new Error('Corpus provenance/policy validation failed.');
  return record;
}
export function assertProductionSource(record) {
  validateCandidate(record);
  const m = record.metadata;
  if (m.expertReview) {
    const evidence = m.expertReview;
    if (evidence.environment !== 'production' || evidence.reviews.length !== 4
        || evidence.reviews.some((review, index) => review.role !== reviewRoles[index] || review.decision !== 'approved'
          || !review.reviewer?.trim() || !review.notes?.trim() || !Number.isFinite(Date.parse(review.reviewedAt))
          || Date.parse(review.reviewedAt) > Date.now() || review.sourceId !== m.originalSourceId
          || fieldsByRole[reviewRoles[index]].some(key => review.checklist?.[key] !== true)
          || review.sourceFingerprint !== evidence.sourceFingerprint)) throw new Error('Incomplete expert review evidence.');
  }
  if (m.reviewStatus !== 'approved' || !m.reviewedBy?.trim() || !m.reviewedAt
      || !Number.isFinite(Date.parse(m.reviewedAt)) || Date.parse(m.reviewedAt) > Date.now()
      || !Number.isInteger(m.approvalVersion) || m.approvalVersion < 1
      || m.approvalFingerprint !== approvalFingerprint(record)) throw new Error('Corpus is not approved for production.');
  return record;
}
export function productionEligible(record) {
  try { assertProductionSource(record); return true; } catch { return false; }
}
export function reviewCorpusSource(record, { status, reviewer, at = new Date().toISOString(), notes = '' }) {
  const current = record.metadata.reviewStatus ?? 'development';
  const transitions = { development: ['candidate', 'rejected'], candidate: ['reviewed', 'rejected'], reviewed: ['approved', 'rejected'], approved: ['rejected'], rejected: ['candidate'] };
  if (!transitions[current]?.includes(status)) throw new Error('Invalid corpus review transition.');
  if (!reviewer?.trim() || !Number.isFinite(Date.parse(at)) || Date.parse(at) > Date.now()) throw new Error('Reviewer and valid timestamp required.');
  if (status === 'approved' && record.metadata.reviewFingerprint !== approvalFingerprint(record)) throw new Error('Source changed after review; reject and review again.');
  const result = structuredClone(record);
  result.metadata = { ...result.metadata, reviewStatus: status, reviewedBy: reviewer, reviewedAt: at, reviewNotes: notes };
  delete result.metadata.approvalFingerprint;
  delete result.metadata.reviewFingerprint;
  if (status !== 'rejected') validateCandidate(result);
  if (status === 'reviewed') result.metadata.reviewFingerprint = approvalFingerprint(result);
  if (status === 'approved') {
    result.metadata.approvalVersion = (record.metadata.approvalVersion ?? 0) + 1;
    result.metadata.approvalFingerprint = approvalFingerprint(result);
  }
  return result;
}
