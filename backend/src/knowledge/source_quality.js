import { z } from 'zod';

export const licenseStatusSchema = z.enum(['public_domain', 'official_permission', 'licensed', 'self_authored', 'unknown']);
export const provenanceFields = {
  expertReview: z.object({
    environment: z.enum(['production', 'test_fixture']), registryFingerprint: z.string().length(64),
    sourceFingerprint: z.string().length(64), templateVersion: z.literal('expert-v1'),
    reviews: z.array(z.object({ role: z.enum(['licenseReviewer', 'contentReviewer', 'traditionExpert', 'safetyReviewer']),
      reviewer: z.string().min(1), reviewedAt: z.string().datetime(), decision: z.literal('approved'),
      notes: z.string().min(1), sourceFingerprint: z.string().length(64), sourceId: z.string().min(1),
      checklist: z.record(z.boolean()),
    }).strict()).length(4),
  }).strict().optional(),
  reviewStatus: z.enum(['development', 'candidate', 'reviewed', 'approved', 'rejected']).optional(),
  publisher: z.string().trim().min(1).max(200).optional(), institution: z.string().trim().min(1).max(200).optional(),
  originalLanguage: z.string().min(2).max(20).optional(), contentLanguage: z.string().min(2).max(20).optional(),
  reviewedBy: z.string().trim().min(1).max(100).nullable().optional(), reviewedAt: z.string().datetime().nullable().optional(),
  reviewNotes: z.string().max(1000).optional(),
  approvalVersion: z.number().int().positive().optional(),
  reviewFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/).optional(), sourceVersion: z.string().trim().min(1).max(100).optional(),
  approvalFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  parentApprovalFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  concepts: z.array(z.string().min(1).max(80)).max(30).optional(),
  qualityScore: z.number().min(0).max(1).optional(), licenseStatus: licenseStatusSchema.optional(),
  licenseNote: z.string().min(1).max(500).optional(), sourceUrl: z.string().url().max(1000).optional(),
  provenance: z.string().min(1).max(1000).optional(), importedAt: z.string().datetime().optional(),
  originalSourceId: z.string().max(128).optional(),
  location: z.object({ unit: z.enum(['verse', 'passage', 'paragraph', 'section', 'commentary']), index: z.number().int().min(0), start: z.number().int().min(0), end: z.number().int().min(1) }).strict().optional(),
};

export function requireProductionLicense(record) {
  const metadata = record.metadata;
  if (!metadata.licenseStatus || metadata.licenseStatus === 'unknown'
      || !metadata.licenseNote || !(metadata.sourceUrl || metadata.provenance)
      || !metadata.importedAt || !metadata.traditionBranch || metadata.qualityScore === undefined) throw new Error('Corpus license/provenance incomplete.');
  return record;
}
