import OpenAI from 'openai';
import { SYSTEM_PROMPT, buildInput } from './prompt.js';
import { responseJsonSchema, responseSchema } from './schema.js';
import { assessRequestCrisis, crisisResponse } from './crisis.js';

export function createOpenAiService({ apiKey, model, client, timeout = 6_000, maxRetries = 1 }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required.');
  const api = client ?? new OpenAI({ apiKey, timeout, maxRetries,
    baseURL: 'https://api.openai.com/v1', logLevel: 'off' });

  async function runStructured({ name, instructions, input, jsonSchema, schema, maxOutputTokens = 1800 }, { signal, onUsage } = {}) {
    const response = await api.responses.create({
      model,
      instructions,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      text: {
        format: {
          type: 'json_schema',
          name,
          strict: true,
          schema: jsonSchema,
        },
      },
      max_output_tokens: maxOutputTokens,
      store: false,
    }, { signal });
    // Only numeric usage leaves this layer; never return raw provider metadata to logs.
    try {
      onUsage?.({ inputTokens: response.usage?.input_tokens,
        ...(Number.isSafeInteger(response.usage?.input_tokens_details?.cached_tokens)
          ? { cachedInputTokens: response.usage.input_tokens_details.cached_tokens } : {}),
        outputTokens: response.usage?.output_tokens });
    } catch { /* Usage tracking cannot turn a successful response into an error. */ }
    if (response.status && response.status !== 'completed') throw new Error('The model response did not complete.');
    if (!response.output_text) throw new Error('The model returned no output text.');
    if (response.output_text.includes(apiKey)) throw new Error('Provider output rejected.');
    return schema.parse(JSON.parse(response.output_text));
  }

  // Preserve the existing callable service contract for any legacy consumers.
  async function generate(body, agent, memorySummary = '', options = {}) {
    const safety = assessRequestCrisis(body);
    if (safety.level > 0) return crisisResponse(body.session.selectedEmotion, safety);
    return runStructured({
      name: 'soul_bible_turn', instructions: SYSTEM_PROMPT,
      input: buildInput(body, agent, memorySummary),
      jsonSchema: responseJsonSchema, schema: responseSchema, maxOutputTokens: 900,
    }, options);
  }
  generate.runStructured = runStructured;
  return generate;
}
