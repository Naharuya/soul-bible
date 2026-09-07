export const reviewRoles = Object.freeze(['licenseReviewer', 'contentReviewer', 'traditionExpert', 'safetyReviewer']);
export const fieldsByRole = Object.freeze({
  licenseReviewer: Object.freeze(['licenseEvidence', 'permittedUsage', 'sourceIdentity']),
  contentReviewer: Object.freeze(['sourceAccuracy', 'quotationContext', 'chunkBoundaries']),
  traditionExpert: Object.freeze(['doctrinalAccuracy', 'traditionConsistency', 'branchBiasDisclosed', 'noInterfaithMixing']),
  safetyReviewer: Object.freeze(['noAbsolutistPromises', 'psychologicalSafety', 'noTreatmentReplacement']),
});
