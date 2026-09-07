import { validateExpertRegistry, registryFingerprint, intakeFingerprint } from './expert_registry.js';
import { normalizeSource } from './ingestion/normalization.js';
import { chunkSource } from './ingestion/chunking.js';
import { enrichChunks } from './ingestion/enrichment.js';
import { contentChecksum, reviewCorpusSource, assertProductionSource } from './production_guard.js';
import { knowledgeRecordSchema } from './contracts.js';

export function approvedCorpus(input, roster, tradition) {
  const registry = validateExpertRegistry(input, roster);
  if (registry.environment !== 'production') throw new Error('Test fixture registries cannot build production corpus.');
  const sources = registry.sources.filter(source => source.tradition === tradition && source.reviewStatus === 'approved');
  if (!sources.length) throw new Error('BLOCKED_EXTERNAL_REVIEW');
  const records = sources.flatMap(source => {
    if (normalizeSource(source).text !== source.text) throw new Error('Normalization changed reviewed text; re-intake required.');
    const base = { sourceId: source.sourceId, tradition: source.tradition, sourceType: source.sourceType,
      title: source.title, reference: source.reference, text: source.text, language: source.language, authorityLevel: source.authorityLevel,
      metadata: { sample: false, license: source.licenseStatus, licenseStatus: source.licenseStatus,
        licenseNote: source.licenseEvidence.slice(0, 500), publisher: source.publisher,
        ...(source.institution ? { institution: source.institution } : {}), sourceUrl: source.sourceUrl,
        provenance: source.provenance, importedAt: source.reviews[0].reviewedAt,
        originalLanguage: source.originalLanguage, contentLanguage: source.language,
        traditionBranch: source.traditionBranch, qualityScore: source.qualityScore,
        sourceVersion: source.sourceVersion, checksum: source.checksum, keywords: source.keywords,
        reviewStatus: 'candidate', expertReview: { environment: registry.environment,
          registryFingerprint: registryFingerprint(registry), sourceFingerprint: intakeFingerprint(source, registry.environment),
          templateVersion: 'expert-v1', reviews: source.reviews },
      } };
    return enrichChunks(base, chunkSource(source)).map(record => {
      record.metadata.checksum = contentChecksum(record.text);
      // These transitions attest the imported, complete four-role decision, never invent a reviewer.
      const reviewer = source.reviewedBy, at = source.reviewedAt, notes = source.reviewNotes;
      const reviewed = reviewCorpusSource(record, { status: 'reviewed', reviewer, at, notes });
      const approved = reviewCorpusSource(reviewed, { status: 'approved', reviewer, at, notes });
      return knowledgeRecordSchema.parse(assertProductionSource(approved));
    });
  });
  if (records.length > 50) throw new Error('Pilot exceeds 50 chunks; submit a smaller reviewed corpus.');
  return records;
}
export async function buildExpertIndex({ registry, roster, tradition, index, indexVersion, corpusVersion }) {
  const records = approvedCorpus(registry, roster, tradition);
  // Reuse phase 6: build is validated, never automatically active.
  return index.build({ indexVersion, corpusVersion, tradition, records });
}

export function citationPayload(records, sourceIds, tradition) {
  if (!Array.isArray(sourceIds) || new Set(sourceIds).size !== sourceIds.length) throw new Error('Invalid citation IDs.');
  if (new Set(records.map(record => record.sourceId)).size !== records.length) throw new Error('Ambiguous citation evidence.');
  return sourceIds.map(sourceId => {
    const record = records.find(source => source.sourceId === sourceId);
    if (!record || record.tradition !== tradition) throw new Error('Citation source missing or wrong tradition.');
    assertProductionSource(record);
    return { sourceId, title: record.title, reference: record.reference,
      institution: record.metadata.institution ?? record.metadata.publisher, authorityLevel: record.authorityLevel };
  });
}
