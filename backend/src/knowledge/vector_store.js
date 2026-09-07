import { validateVector } from './embedding_provider.js';
import { knowledgeNamespaces, validateNamespace } from './namespaces.js';
import { knowledgeRecordSchema } from './contracts.js';
import { assertProductionSource } from './production_guard.js';

export function cosineSimilarity(a, b) {
  validateVector(a); validateVector(b, a.length);
  return Math.max(-1, Math.min(1, a.reduce((sum, value, i) => sum + value * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b))));
}
export function createMemoryVectorStore({ mode = 'development' } = {}) {
  if (!['development', 'production'].includes(mode)) throw new Error('Invalid corpus mode.');
  const namespaces = new Map();
  return Object.freeze({
    async upsert(records, { signal } = {}) {
      signal?.throwIfAborted();
      if (!Array.isArray(records) || records.length > 1000) throw new Error('Invalid vector batch.');
      // Validate the entire mutation before writing any records.
      const validated = records.map(item => {
        validateNamespace(item.namespace);
        const record = knowledgeRecordSchema.parse(item.record);
        if (mode === 'production') assertProductionSource(record);
        if (knowledgeNamespaces[record.tradition] !== item.namespace || record.sourceId !== item.id) throw new Error('Vector namespace mismatch.');
        if (typeof item.embeddingId !== 'string' || !item.embeddingId) throw new Error('Embedding identity required.');
        return { ...item, record, vector: [...validateVector(item.vector)] };
      });
      const identities = new Map();
      for (const item of validated) {
        const existing = namespaces.get(item.namespace)?.values().next().value;
        const identity = `${item.embeddingId}:${item.vector.length}`;
        if ((existing && `${existing.embeddingId}:${existing.vector.length}` !== identity)
            || (identities.has(item.namespace) && identities.get(item.namespace) !== identity)) throw new Error('Embedding version mismatch.');
        identities.set(item.namespace, identity);
      }
      for (const item of validated) {
        if (!namespaces.has(item.namespace)) namespaces.set(item.namespace, new Map());
        namespaces.get(item.namespace).set(item.id, structuredClone(item));
      }
    },
    async search(vector, { namespace, limit = 5, embeddingId, signal } = {}) {
      signal?.throwIfAborted(); validateNamespace(namespace); validateVector(vector);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !embeddingId) throw new Error('Invalid vector search.');
      return [...(namespaces.get(namespace)?.values() ?? [])].map(item => {
        if (mode === 'production') assertProductionSource(item.record);
        if (item.embeddingId !== embeddingId) throw new Error('Embedding version mismatch.');
        return { record: structuredClone(item.record), score: cosineSimilarity(vector, item.vector) };
      }).sort((a, b) => b.score - a.score || a.record.sourceId.localeCompare(b.record.sourceId)).slice(0, limit);
    },
    async delete(namespace, ids) {
      validateNamespace(namespace);
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('Invalid vector IDs.');
      for (const id of ids) namespaces.get(namespace)?.delete(id);
    },
    async clear(namespace) { validateNamespace(namespace); namespaces.delete(namespace); },
  });
}
