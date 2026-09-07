import { z } from 'zod';
import { religionSchema, religionOutputSchema } from './agent_contracts.js';
import { calculateRetrievalConfidence } from '../knowledge/retrieval_confidence.js';

export const specialistResultSchema = z.object({
  agent: z.string().min(1), tradition: religionSchema,
  // Retrieval/evidence support score; not a calibrated probability of doctrinal truth.
  confidence: z.number().min(0).max(1),
  emotionalSupport: z.string().min(1).max(200),
  religiousInsight: z.string().min(1).max(250),
  suggestedPractice: z.object({ guidance: z.string().min(1).max(250), reflectionQuestion: z.string().min(1).max(160) }).strict(),
  caution: z.array(z.string().min(1).max(160)).max(3),
  sourceHints: z.array(z.string().min(1).max(128)).max(5),
}).strict();

export function toSpecialistResult(draft, specialist, psychology, sourceContext = [], retrievalConfidence) {
  const result = religionOutputSchema.parse(draft);
  return specialistResultSchema.parse({ agent: specialist.identity, tradition: specialist.id,
    confidence: retrievalConfidence ?? calculateRetrievalConfidence({ sources: sourceContext, tradition: specialist.id }), emotionalSupport: psychology.emotionSummary,
    religiousInsight: result.perspective,
    suggestedPractice: { guidance: result.guidance, reflectionQuestion: result.reflectionQuestion },
    caution: result.cautions, sourceHints: result.sourceRefs });
}

export function toLegacyReligion(output) {
  if (!Object.hasOwn(output, 'tradition')) return religionOutputSchema.parse(output);
  const result = specialistResultSchema.parse(output);
  return religionOutputSchema.parse({ perspective: result.religiousInsight, ...result.suggestedPractice,
    cautions: result.caution, sourceRefs: result.sourceHints });
}
