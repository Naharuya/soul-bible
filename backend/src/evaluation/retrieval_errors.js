export function classifyRetrievalErrors(question, sources) {
  const issues = new Set();
  const criteria = question.expectedSourceCriteria;
  const desired = new Set(criteria.ids);
  if (sources.some(source => source.tradition !== question.tradition || question.mustNotRetrieve.sourceIds.includes(source.sourceId))) issues.add('WRONG_TRADITION');
  if (criteria.traditionBranch && sources.some(source => source.metadata.traditionBranch !== criteria.traditionBranch)) issues.add('WRONG_BRANCH');
  if (sources.some(source => !criteria.authorityLevels.includes(source.authorityLevel))) issues.add('AUTHORITY_MISMATCH');
  if (sources.length === 0 && !criteria.allowEmpty) issues.add('EMPTY_RESULT');
  if (criteria.reference && !sources.some(source => source.reference === criteria.reference)) issues.add('REFERENCE_MISS');
  if (new Set(sources.map(source => source.sourceId)).size !== sources.length
      || new Set(sources.map(source => source.text.normalize('NFKC').trim())).size !== sources.length) issues.add('DUPLICATE_RESULT');
  if (sources.length && (!sources.some(source => desired.has(source.sourceId))
      || (question.expectedConcepts.length && !sources.some(source => question.expectedConcepts.some(concept => source.metadata.concepts?.includes(concept)))))) issues.add('LOW_SEMANTIC_MATCH');
  const first = sources.findIndex(source => desired.has(source.sourceId));
  if (first > 0) issues.add('RANKING_FAILURE');
  return [...issues];
}
