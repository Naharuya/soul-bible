import { psychologySchema, psychologyJsonSchema } from './agent_contracts.js';
import { prompt } from './prompts/psychology_prompt.js';

export function createPsychologyAgent({ runStructured }) {
  return async (context, { signal } = {}) => psychologySchema.parse(await runStructured({
    name: 'psychology_reflection',
    instructions: `[${prompt.version}]\n${prompt.instructions}`,
    input: context,
    jsonSchema: psychologyJsonSchema,
    schema: psychologySchema,
  }, { signal }));
}
