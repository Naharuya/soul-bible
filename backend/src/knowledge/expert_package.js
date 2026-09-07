import { registryFingerprint, intakeFingerprint, reviewTemplate, sourceRegistrySchema, reviewRoles } from './expert_registry.js';
import { chunkSource } from './ingestion/chunking.js';

// Export only corpus metadata/content. There is deliberately no conversation/user-log input.
export function expertPackage(input) {
  const registry = sourceRegistrySchema.parse(input);
  const rows = registry.sources.map(source => ({ sourceId: source.sourceId, tradition: source.tradition,
    branch: source.traditionBranch, title: source.title, publisher: source.publisher, institution: source.institution,
    sourceUrl: source.sourceUrl, sourceType: source.sourceType, language: source.language, originalLanguage: source.originalLanguage,
    sourceVersion: source.sourceVersion, checksum: source.checksum, licenseStatus: source.licenseStatus,
    licenseEvidence: source.licenseEvidence, provenance: source.provenance, expectedUsage: source.expectedUsage,
    sourceText: source.text, chunks: chunkSource(source), reviewStatus: source.reviewStatus,
    sourceFingerprint: intakeFingerprint(source, registry.environment), reviewChecklist: reviewTemplate(source.tradition),
    completedReviews: source.reviews, reviewDecision: null, reviewNotes: '',
    nextReview: source.reviews.length < 4 && source.reviewStatus !== 'rejected' ? {
      sourceId: source.sourceId, sourceFingerprint: intakeFingerprint(source, registry.environment),
      role: reviewRoles[source.reviews.length], reviewer: '', reviewedAt: null, decision: null, notes: '',
      checklist: Object.fromEntries(reviewTemplate(source.tradition).roles[reviewRoles[source.reviews.length]].checklist.map(key => [key, false])),
    } : null,
  }));
  return { schemaVersion: 1, environment: registry.environment, registryFingerprint: registryFingerprint(registry), rows };
}
export function packageCsv(pack) {
  const columns = ['sourceId', 'tradition', 'branch', 'title', 'publisher', 'institution', 'sourceUrl', 'sourceType', 'language', 'originalLanguage',
    'sourceVersion', 'checksum', 'licenseStatus', 'licenseEvidence', 'provenance', 'expectedUsage', 'sourceText', 'chunks',
    'sourceFingerprint', 'reviewStatus', 'reviewChecklist', 'completedReviews', 'nextReview', 'reviewDecision', 'reviewNotes'];
  const cell = value => {
    let data = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+@-]/.test(data)) data = `'${data}`; // Spreadsheet formula injection defense.
    return `"${data.replaceAll('"', '""')}"`;
  };
  return [columns.map(cell).join(','), ...pack.rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n';
}
