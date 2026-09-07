import { normalizeSource } from './normalization.js';
import { validateRawSource } from './validation.js';
import { chunkSource } from './chunking.js';
import { enrichChunks } from './enrichment.js';
import { knowledgeNamespaces } from '../namespaces.js';
import { validateVector, MAX_EMBED_BATCH, withEmbeddingDeadline } from '../embedding_provider.js';
import { assertProductionSource, approvalFingerprint, contentChecksum } from '../production_guard.js';

export function createCorpusIngestion({ embeddingProvider, vectorStore, timeoutMs = 1500, mode = 'development' }) {
  if (!['development', 'production'].includes(mode)) throw new Error('Invalid corpus mode.');
  return Object.freeze({
    async ingest(raw, { signal, unit = 'paragraph' } = {}) {
      signal?.throwIfAborted();
      const normalized = normalizeSource(raw);
      normalized.metadata = { ...normalized.metadata, importedAt: normalized.metadata?.importedAt ?? new Date().toISOString() };
      const source = validateRawSource(normalized);
      if (mode === 'production') assertProductionSource(source);
      const records = enrichChunks(source, chunkSource(source, { unit }));
      if (mode === 'production') for (const record of records) {
        // Derived chunks inherit a verified parent's review; content/position changes are rebound.
        record.metadata.parentApprovalFingerprint = source.metadata.approvalFingerprint;
        record.metadata.checksum = contentChecksum(record.text);
        record.metadata.approvalFingerprint = approvalFingerprint(record);
        assertProductionSource(record);
      }
      await withEmbeddingDeadline(async activeSignal => {
        const vectors = [];
        for (let offset = 0; offset < records.length; offset += MAX_EMBED_BATCH) {
          const batch = records.slice(offset, offset + MAX_EMBED_BATCH);
          const encoded = await embeddingProvider.embedBatch(batch.map(record => record.text), { signal: activeSignal });
          activeSignal.throwIfAborted();
          if (!Array.isArray(encoded) || encoded.length !== batch.length) throw new Error('Invalid embedding batch result.');
          vectors.push(...encoded);
        }
        vectors.forEach(vector => validateVector(vector, vectors[0].length));
        activeSignal.throwIfAborted();
        // One validated atomic upsert; no partial writes if embedding fails.
        await vectorStore.upsert(records.map((record, index) => ({ namespace: knowledgeNamespaces[source.tradition], id: record.sourceId,
          record, vector: vectors[index], embeddingId: embeddingProvider.id })), { signal: activeSignal });
      }, { signal, timeoutMs });
      return { namespace: knowledgeNamespaces[source.tradition], records };
    },
  });
}
