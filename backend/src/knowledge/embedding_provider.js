import { createHash } from 'node:crypto';

export const MAX_EMBED_BATCH = 32;
export function validateTexts(texts) {
  if (!Array.isArray(texts) || !texts.length || texts.length > MAX_EMBED_BATCH
      || texts.some(text => typeof text !== 'string' || !text.trim() || text.length > 4000)) throw new Error('Invalid embedding batch.');
}
export function validateVector(vector, dimensions) {
  if (!Array.isArray(vector) || !vector.length || vector.length > 8192
      || (dimensions !== undefined && vector.length !== dimensions)
      || vector.some(value => !Number.isFinite(value)) || !vector.some(value => value !== 0)) throw new Error('Invalid embedding vector.');
  return vector;
}

// A deterministic offline baseline with a small bilingual concept dictionary.
// This is not a pretrained semantic model or a substitute for production evaluation.
const concepts = [
  ['기도', 'prayer', 'pray'], ['위로', 'comfort', '격려'], ['불안', '걱정', 'anxiety', 'worry'],
  ['명상', '마음챙김', 'meditation', 'mindfulness'], ['자비', 'compassion', '친절'],
  ['효', '부모', 'filial'], ['성찰', '묵상', 'reflection'], ['관계', 'relationship'],
  ['공동체', 'community'], ['다르마', 'dharma'], ['성사', 'sacrament'], ['연기', 'interdependence'],
];
export function createLocalEmbeddingProvider() {
  const dimensions = 256;
  function encode(text) {
    const normalized = text.normalize('NFKC').toLowerCase();
    const vector = Array(dimensions).fill(0);
    for (const token of normalized.match(/[\p{L}\p{N}]+/gu) ?? []) {
      const hash = createHash('sha256').update(token).digest();
      vector[32 + hash.readUInt16BE(0) % (dimensions - 32)] += 1;
    }
    concepts.forEach((terms, index) => { if (terms.some(term => normalized.includes(term))) vector[index] += 4; });
    if (!vector.some(Boolean)) vector[255] = 1;
    const norm = Math.hypot(...vector);
    return vector.map(value => value / norm);
  }
  return Object.freeze({
    id: 'local-concepts-v1', dimensions, external: false,
    async embed(text, options) { return (await this.embedBatch([text], options))[0]; },
    async embedBatch(texts, { signal } = {}) { signal?.throwIfAborted(); validateTexts(texts); return texts.map(encode); },
  });
}

export async function withEmbeddingDeadline(operation, { signal, timeoutMs = 1500 } = {}) {
  signal?.throwIfAborted();
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('Invalid embedding deadline.');
  const controller = new AbortController();
  let timer;
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  let removeAbort;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return operation(controller.signal); }),
      new Promise((_, reject) => {
        const fail = () => reject(controller.signal.reason ?? new Error('Embedding aborted.'));
        controller.signal.addEventListener('abort', fail, { once: true });
        removeAbort = () => controller.signal.removeEventListener('abort', fail);
        timer = setTimeout(() => controller.abort(new Error('Embedding timeout.')), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); removeAbort?.(); signal?.removeEventListener('abort', abort); }
}
