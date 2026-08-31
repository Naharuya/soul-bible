import OpenAI from 'openai';
import { SYSTEM_PROMPT, buildInput } from './prompt.js';
import { responseJsonSchema, responseSchema } from './schema.js';

export function createOpenAiService({ apiKey, model }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required.');
  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 2 });

  return async function generate(body) {
    const response = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input: buildInput(body),
      text: {
        format: {
          type: 'json_schema',
          name: 'soul_bible_turn',
          strict: true,
          schema: responseJsonSchema,
        },
      },
      max_output_tokens: 900,
      store: false,
    });
    if (!response.output_text) throw new Error('The model returned no output text.');
    return responseSchema.parse(JSON.parse(response.output_text));
  };
}
