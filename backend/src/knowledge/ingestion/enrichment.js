import { createHash } from 'node:crypto';
import { knowledgeRecordSchema } from '../contracts.js';
export const chunkSourceId = (source, index, text) => `${source.tradition}:chunk:${createHash('sha256').update(`${source.sourceId}:${index}:${text}`).digest('hex').slice(0, 32)}`;

export function enrichChunks(source, chunks) {
  return chunks.map(chunk => knowledgeRecordSchema.parse({ ...source,
    sourceId: chunkSourceId(source, chunk.location.index, chunk.text),
    text: chunk.text,
    metadata: { ...source.metadata, originalSourceId: source.sourceId, location: chunk.location },
  }));
}
