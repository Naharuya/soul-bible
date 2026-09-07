import { z } from 'zod';
import { religionSchema } from '../agents/agent_contracts.js';
import { provenanceFields } from './source_quality.js';

export const authorityLevels = ['primary', 'official', 'scholarly', 'secondary'];
export const knowledgeRecordSchema = z.object({
  sourceId: z.string().regex(/^[a-z0-9][a-z0-9:._-]{0,127}$/),
  tradition: religionSchema, sourceType: z.string().min(1).max(80),
  title: z.string().min(1).max(200), reference: z.string().min(1).max(200),
  text: z.string().min(1).max(4000), language: z.string().min(2).max(20),
  authorityLevel: z.enum(authorityLevels),
  metadata: z.object({
    ...provenanceFields,
    traditionBranch: z.string().max(100).optional(), sect: z.string().max(100).optional(),
    school: z.string().max(100).optional(), license: z.string().min(1).max(200),
    sample: z.boolean(), keywords: z.array(z.string().min(1).max(80)).max(20).default([]),
  }).strict(),
}).strict();
export const searchSchema = z.object({
  tradition: religionSchema, query: z.string().trim().min(1).max(2000),
  language: z.string().min(2).max(20).default('ko-KR'), limit: z.number().int().min(1).max(5).default(3),
  traditionBranch: z.string().min(1).max(100).optional(),
}).strict();
export const retrievalDiagnosticsSchema = z.object({
  retrievalMode: z.enum(['keyword', 'vector', 'hybrid', 'keyword_fallback']),
  fallbackReason: z.enum(['embedding_unavailable', 'vector_unavailable', 'insufficient_candidates']).nullable(),
  scores: z.array(z.object({ sourceId: z.string().max(128), keywordScore: z.number().min(0).max(1),
    vectorScore: z.number().min(0).max(1), rerankScore: z.number().min(0).max(1),
    components: z.record(z.number().finite().min(-1).max(1)).optional() }).strict()).max(5),
}).strict();
export const searchResultSchema = z.object({
  tradition: religionSchema, query: z.string().max(2000), results: z.array(knowledgeRecordSchema).max(5),
  diagnostics: retrievalDiagnosticsSchema.optional(),
}).strict();

export function knowledgeError() {
  const error = new Error('Knowledge retrieval failed validation.');
  error.code = 'KNOWLEDGE_RETRIEVAL';
  return error;
}
