import { answerExamplesSchema, answerExamplesJsonSchema } from '../answer_examples.js';
import { z } from 'zod';
import { provenanceFields } from '../knowledge/source_quality.js';

export const religionIds = ['protestant', 'catholic', 'buddhist', 'jewish', 'islamic', 'hindu', 'confucian'];
export const religionSchema = z.enum(religionIds);
export const psychologySchema = z.object({
  emotionSummary: z.string().trim().min(1).max(200),
  supportNeed: z.string().trim().min(1).max(160),
  suggestedTone: z.enum(['gentle', 'calm', 'encouraging']),
  avoid: z.array(z.string().trim().min(1).max(100)).max(5),
}).strict();
export const psychologyJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['emotionSummary', 'supportNeed', 'suggestedTone', 'avoid'],
  properties: {
    emotionSummary: { type: 'string', maxLength: 200 }, supportNeed: { type: 'string', maxLength: 160 },
    suggestedTone: { type: 'string', enum: ['gentle', 'calm', 'encouraging'] },
    avoid: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 5 },
  },
};
export const religionOutputSchema = z.object({
  perspective: z.string().trim().min(1).max(250),
  guidance: z.string().trim().min(1).max(250),
  reflectionQuestion: z.string().trim().min(1).max(160),
  answerExamples: answerExamplesSchema,
  sourceRefs: z.array(z.string().min(1).max(128)).max(5),
  cautions: z.array(z.string().min(1).max(160)).max(3),
}).strict();

export const religionJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['perspective', 'guidance', 'reflectionQuestion', 'sourceRefs', 'cautions', 'answerExamples'],
  properties: {
    perspective: { type: 'string', maxLength: 250 }, guidance: { type: 'string', maxLength: 250 },
    reflectionQuestion: { type: 'string', maxLength: 160 },
    answerExamples: answerExamplesJsonSchema,
    sourceRefs: { type: 'array', items: { type: 'string', maxLength: 128 }, maxItems: 5 },
    cautions: { type: 'array', items: { type: 'string', maxLength: 160 }, maxItems: 3 },
  },
};

// Internal, server-owned provenance only. Public requests cannot supply this structure.
export const sourceContextSchema = z.array(z.object({
  id: z.string().trim().min(1).max(128), religion: religionSchema,
  reference: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(4000),
  sourceType: z.string().max(80).optional(), title: z.string().max(200).optional(),
  language: z.string().max(20).optional(), authorityLevel: z.enum(['primary', 'official', 'scholarly', 'secondary']).optional(),
  metadata: z.object({
    ...provenanceFields,
    traditionBranch: z.string().max(100).optional(), sect: z.string().max(100).optional(), school: z.string().max(100).optional(),
    license: z.string().max(200), sample: z.boolean(), keywords: z.array(z.string().max(80)).max(20),
  }).strict().optional(),
}).strict()).max(20);
