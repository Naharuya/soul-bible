import { religionOutputSchema, religionJsonSchema, psychologySchema, sourceContextSchema } from '../agent_contracts.js';
import { commonReligionInstructions } from '../prompts/common_religion_prompt.js';
import { religionProfile } from './religion_profiles.js';
import { toSpecialistResult } from '../specialist_result.js';
import { retrievalInstructions } from '../prompts/retrieval_prompt.js';

export function createReligionAgent({ prompt }) {
  const { id, label, version } = prompt;
  const profile = religionProfile(id);
  return Object.freeze({
    id, label, promptVersion: version, ...profile,
    async generateResult(input, runStructured, options) {
      return toSpecialistResult(await this.generate(input, runStructured, options), this, input.psychology, input.sourceContext, input.retrievalConfidence);
    },
    async generate(input, runStructured, { signal } = {}) {
      const psychology = psychologySchema.parse(input.psychology);
      const sourceContext = sourceContextSchema.parse(input.sourceContext ?? []).filter((source) => source.religion === id);
      return religionOutputSchema.parse(await runStructured({
        name: `religion_${id}`,
        instructions: `[${version}]\n${commonReligionInstructions}\n\n${prompt.instructions}\n${JSON.stringify(profile)}\n${retrievalInstructions}`,
        input: { ...input, psychology, sourceContext },
        schema: religionOutputSchema,
        jsonSchema: {
          ...religionJsonSchema,
          properties: {
            ...religionJsonSchema.properties,
            sourceRefs: sourceContext.length
              ? { type: 'array', items: { type: 'string', enum: sourceContext.map((source) => source.id) }, maxItems: 5 }
              : { type: 'array', items: { type: 'string' }, maxItems: 0 },
          },
        },
      }, { signal }));
    },
  });
}
