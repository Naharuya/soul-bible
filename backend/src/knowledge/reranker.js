const normalize = text => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export function keywordOverlap(query, record) {
  const words = [...new Set(normalize(query).match(/[\p{L}\p{N}]+/gu) ?? [])];
  const text = normalize(`${record.title} ${record.text} ${record.metadata.keywords.join(' ')}`);
  if (!words.length) return 0;
  const overlap = words.filter(word => text.includes(word)).length / words.length;
  const keyMatch = record.metadata.keywords.some(word => normalize(query).includes(normalize(word))) ? 0.5 : 0;
  return Math.min(1, overlap + keyMatch);
}
export const defaultWeights = Object.freeze({ keyword: 0.25, vector: 0.4, authority: 0.1, reference: 0.15, branch: 0.05, quality: 0.05, duplicate: 0.25 });
export function createReRanker(weights = defaultWeights, { strictBranch = false } = {}) {
  const configured = { ...defaultWeights, ...weights };
  if (Object.keys(configured).some(key => !Object.hasOwn(defaultWeights, key))
      || Object.values(configured).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Invalid reranker weights.');
  return Object.freeze({
  rerank({ candidates, query, tradition, language, traditionBranch, limit, concepts = [] }) {
    const seen = new Set();
    return candidates.filter(({ record }) => record.tradition === tradition && record.language === language
      && (!strictBranch || !traditionBranch || record.metadata.traditionBranch === traditionBranch)).map(candidate => {
      const { record } = candidate;
      const conceptMatch = concepts.length ? concepts.filter(id => record.metadata.concepts?.includes(id)).length / concepts.length : 0;
      const keywordScore = Math.max(keywordOverlap(query, record), conceptMatch);
      const vectorScore = Math.max(0, Math.min(1, candidate.vectorScore ?? 0));
      const authority = { primary: 1, official: 0.8, scholarly: 0.6, secondary: 0.3 }[record.authorityLevel];
      const reference = normalize(query).includes(normalize(record.reference)) ? 1 : 0;
      const branch = !traditionBranch ? 0 : record.metadata.traditionBranch === traditionBranch ? 1 : -1;
      const key = normalize(record.text);
      const duplicatePenalty = seen.has(key) ? configured.duplicate : 0;
      seen.add(key);
      const components = { semantic: configured.vector * vectorScore, lexical: configured.keyword * keywordScore,
        authority: configured.authority * authority, reference: configured.reference * reference,
        branch: configured.branch * branch, quality: configured.quality * (record.metadata.qualityScore ?? 0.3),
        duplicate: -duplicatePenalty, language: 1, tradition: 1, conceptMatch };
      const rerankScore = Math.max(0, Math.min(1, components.semantic + components.lexical + components.authority
        + components.reference + components.branch + components.quality + components.duplicate));
      return { record, keywordScore, vectorScore, rerankScore, components };
    }).sort((a, b) => b.rerankScore - a.rerankScore || a.record.sourceId.localeCompare(b.record.sourceId)).slice(0, limit);
  },
  });
}
export const deterministicReRanker = createReRanker();
