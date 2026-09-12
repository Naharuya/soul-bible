import { psychologySchema, psychologyJsonSchema } from './agent_contracts.js';
import { prompt } from './prompts/psychology_prompt.js';
import { z } from 'zod';
import { emotions } from '../schema.js';

export const supportSchema = z.object({
  emotion: z.enum(emotions), empathy: z.string().trim().min(1).max(140),
  nextQuestion: z.string().trim().min(1).max(100), summary: z.string().trim().min(1).max(120),
}).strict();
export const supportJsonSchema = {
  type: 'object', additionalProperties: false, required: ['emotion', 'empathy', 'nextQuestion', 'summary'],
  properties: { emotion: { type: 'string', enum: emotions }, empathy: { type: 'string' },
    nextQuestion: { type: 'string' }, summary: { type: 'string' } },
};

export function createSupportTurn({ runStructured }) {
  return async (context, options) => supportSchema.parse(await runStructured({
    name: 'support_turn_v1',
    instructions: '감정 관찰과 짧은 공감, 다음 질문 하나, 핵심 기억 한 문장을 한 번에 작성합니다. 각 문장은 짧게 쓰세요. 요약은 감정과 필요만 담고 원문을 복사하지 마세요. 진단·처방·교리 해석·경전 인용은 하지 마세요. 질문은 사용자가 이미 답한 질문을 반복하지 마세요.',
    input: context, schema: supportSchema, jsonSchema: supportJsonSchema,
  }, options));
}

export function createPsychologyAgent({ runStructured }) {
  return async (context, { signal } = {}) => psychologySchema.parse(await runStructured({
    name: 'psychology_reflection',
    instructions: `[${prompt.version}]\n${prompt.instructions}`,
    input: context,
    jsonSchema: psychologyJsonSchema,
    schema: psychologySchema,
  }, { signal }));
}
