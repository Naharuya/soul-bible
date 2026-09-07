import { createLocalEmbeddingProvider, validateVector, withEmbeddingDeadline, MAX_EMBED_BATCH } from './embedding_provider.js';
import { createMemoryVectorStore } from './vector_store.js';
import { knowledgeNamespaces } from './namespaces.js';
import { keywordRetriever } from './retriever.js';
import { deterministicReRanker, keywordOverlap } from './reranker.js';
import { isDeepStrictEqual } from 'node:util';

export function createHybridRetriever({ embeddingProvider = createLocalEmbeddingProvider(),
  vectorStoreFactory = createMemoryVectorStore, indexedVectorStore, reranker = deterministicReRanker, timeoutMs = 1500 } = {}) {
  return Object.freeze({
    async retrieve(input, { signal } = {}) {
      signal?.throwIfAborted();
      const keyword = keywordRetriever.rank({ ...input, limit: 20 });
      const fallback = fallbackReason => ({ records: keyword.slice(0, input.limit), diagnostics: {
        retrievalMode: 'keyword_fallback', fallbackReason,
        scores: keyword.slice(0, input.limit).map(record => ({ sourceId: record.sourceId, keywordScore: keywordOverlap(input.query, record), vectorScore: 0, rerankScore: keywordOverlap(input.query, record) })),
      } });
      if (!embeddingProvider) return fallback('embedding_unavailable');
      let stage = 'embedding_unavailable';
      try {
        // A private index for this snapshot prevents stale evidence and concurrent mutation races.
        // An injected ingestion index skips online corpus embeddings and remains read-only here.
        const ranked = await withEmbeddingDeadline(async activeSignal => {
          const store = indexedVectorStore ?? vectorStoreFactory();
          const namespace = knowledgeNamespaces[input.tradition];
          const vectors = [];
          if (!indexedVectorStore && input.records.length > (embeddingProvider.external ? 64 : 256)) throw new Error('Online embedding budget exceeded.');
          for (let offset = 0; !indexedVectorStore && offset < input.records.length; offset += MAX_EMBED_BATCH) {
            const batch = input.records.slice(offset, offset + MAX_EMBED_BATCH);
            const encoded = await embeddingProvider.embedBatch(batch.map(record => `${record.title}\n${record.text}`), { signal: activeSignal });
            activeSignal.throwIfAborted();
            if (!Array.isArray(encoded) || encoded.length !== batch.length) throw new Error('Invalid embeddings.');
            vectors.push(...encoded);
          }
          const queryVector = validateVector(await embeddingProvider.embed(input.query, { signal: activeSignal }));
          vectors.forEach(vector => validateVector(vector, queryVector.length));
          activeSignal.throwIfAborted(); stage = 'vector_unavailable';
          if (!indexedVectorStore) await store.upsert(input.records.map((record, index) => ({ namespace, id: record.sourceId, record,
            vector: vectors[index], embeddingId: embeddingProvider.id })), { signal: activeSignal });
          activeSignal.throwIfAborted();
          const hits = await store.search(queryVector, { namespace, limit: 20, embeddingId: embeddingProvider.id, signal: activeSignal });
          activeSignal.throwIfAborted();
          const merged = new Map(keyword.map(record => [record.sourceId, { record, vectorScore: 0 }]));
          const normalizedQuery = input.query.normalize('NFKC').toLowerCase();
          for (const record of input.records) {
            if (normalizedQuery.includes(record.reference.normalize('NFKC').toLowerCase())) merged.set(record.sourceId, { record, vectorScore: 0 });
          }
          for (const hit of hits) {
            if (!Number.isFinite(hit.score) || hit.score < -1 || hit.score > 1
                || !input.records.some(record => isDeepStrictEqual(record, hit.record))) throw new Error('Untrusted vector result.');
            if (hit.score >= 0.35) merged.set(hit.record.sourceId, { record: hit.record, vectorScore: Math.max(0, hit.score) });
          }
          return reranker.rerank({ ...input, candidates: [...merged.values()] });
        }, { signal, timeoutMs });
        signal?.throwIfAborted();
        if (!ranked.length || ranked.length < Math.min(input.limit, keyword.length)) return fallback('insufficient_candidates');
        return { records: ranked.map(item => item.record), diagnostics: { retrievalMode: 'hybrid', fallbackReason: null,
          scores: ranked.map(({ record, keywordScore, vectorScore, rerankScore, components }) => ({ sourceId: record.sourceId, keywordScore, vectorScore, rerankScore, ...(components ? { components } : {}) })),
        } };
      } catch {
        signal?.throwIfAborted();
        return fallback(stage);
      }
    },
  });
}
