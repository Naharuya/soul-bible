import { z } from 'zod';
import { knowledgeRecordSchema } from '../contracts.js';
import { requireProductionLicense } from '../source_quality.js';

const rawSourceSchema = knowledgeRecordSchema.extend({ text: z.string().min(1).max(100000) });
export function validateRawSource(raw) {
  const source = rawSourceSchema.parse(raw);
  // Ingestion is stricter than reading the legacy development sample files.
  requireProductionLicense(source);
  return source;
}
