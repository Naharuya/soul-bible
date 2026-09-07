import { createLocalEmbeddingProvider, validateVector, withEmbeddingDeadline } from './embedding_provider.js';
import { cosineSimilarity } from './vector_store.js';
import { keywordRetriever } from './retriever.js';
import { keywordOverlap, createReRanker } from './reranker.js';
import { createHybridRetriever } from './hybrid_retriever.js';
import { normalizeRetrievalQuery } from './query_normalization.js';

export function createRetrievalStrategy({ strategy = 'keyword', normalize = true, weights, embeddingProvider = createLocalEmbeddingProvider() } = {}) {
  if (!['keyword', 'vector', 'hybrid'].includes(strategy)) throw new Error('Invalid retrieval strategy.');
  const hybrid = createHybridRetriever({ embeddingProvider, reranker: createReRanker(weights, { strictBranch: true }) });
  return Object.freeze({
    async retrieve(request, { signal } = {}) {
      const normalized = normalize ? normalizeRetrievalQuery(request) : { query: request.query, concepts: [] };
      const input = { ...request, query: normalized.query, concepts: normalized.concepts };
      if (strategy === 'hybrid') return hybrid.retrieve(input, { signal });
      if (strategy === 'keyword') {
        const records = keywordRetriever.rank(input);
        return { records, diagnostics: { retrievalMode: 'keyword', fallbackReason: null, scores: records.map(record => ({
          sourceId: record.sourceId, keywordScore: keywordOverlap(input.query, record), vectorScore: 0, rerankScore: keywordOverlap(input.query, record),
        })) } };
      }
      // Pure vector benchmark: no keyword merge/fallback or authority bonus can mask vector misses.
      const ranked = await withEmbeddingDeadline(async activeSignal => {
        const vectors = [];
        for (let offset = 0; offset < input.records.length; offset += 32) {
          const batch = input.records.slice(offset, offset + 32);
          const encoded = await embeddingProvider.embedBatch(batch.map(record => `${record.title}\n${record.text}`), { signal: activeSignal });
          activeSignal.throwIfAborted();
          if (encoded.length !== batch.length) throw new Error('Invalid vector benchmark batch.');
          vectors.push(...encoded);
        }
        const query = validateVector(await embeddingProvider.embed(input.query, { signal: activeSignal }));
        return input.records.map((record, i) => ({ record, score: cosineSimilarity(query, vectors[i]) }))
          .filter(hit => hit.score >= 0.35).sort((a, b) => b.score - a.score || a.record.sourceId.localeCompare(b.record.sourceId)).slice(0, input.limit);
      }, { signal });
      return { records: ranked.map(hit => hit.record), diagnostics: { retrievalMode: 'vector', fallbackReason: null,
        scores: ranked.map(hit => ({ sourceId: hit.record.sourceId, keywordScore: keywordOverlap(input.query, hit.record), vectorScore: hit.score, rerankScore: hit.score })),
      } };
    },
  });
}
