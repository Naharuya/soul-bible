import { createHash } from 'node:crypto';
import { knowledgeRecordSchema } from '../contracts.js';

export function enrichChunks(source, chunks) {
  return chunks.map(chunk => knowledgeRecordSchema.parse({ ...source,
    sourceId: `${source.tradition}:chunk:${createHash('sha256').update(`${source.sourceId}:${chunk.location.index}:${chunk.text}`).digest('hex').slice(0, 32)}`,
    text: chunk.text,
    metadata: { ...source.metadata, originalSourceId: source.sourceId, location: chunk.location },
  }));
}
