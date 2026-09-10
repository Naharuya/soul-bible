import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { createOpenAiService } from '../src/openai_service.js';
import { readFile } from 'node:fs/promises';
import OpenAI from 'openai';

const task = { name: 'example_task', instructions: 'test instructions', input: { text: 'sample' },
  schema: z.object({ ok: z.boolean() }).strict(),
  jsonSchema: { type: 'object', required: ['ok'], additionalProperties: false, properties: { ok: { type: 'boolean' } } },
};

test('stage 8: reuses Responses API with structured output and cancellation', async () => {
  let sent; let options;
  const service = createOpenAiService({ apiKey: 'test-key', model: 'test-model',
    client: { responses: { create: async (body, opts) => { sent = body; options = opts; return { output_text: '{"ok":true}', status: 'completed' }; } } },
  });
  const controller = new AbortController();
  assert.deepEqual(await service.runStructured(task, { signal: controller.signal }), { ok: true });
  assert.equal(sent.model, 'test-model'); assert.equal(sent.store, false);
  assert.equal(sent.text.format.type, 'json_schema'); assert.equal(sent.text.format.strict, true);
  assert.deepEqual(sent.text.format.schema, task.jsonSchema);
  assert.equal(options.signal, controller.signal);
});

for (const response of [{ output_text: '' }, { output_text: 'not-json' }, { output_text: '{"ok":42}' },
  { output_text: '{"ok":true}', status: 'incomplete' }, { output_text: '{"ok":true}', status: 'failed' }]) {
  test(`stage 8: rejects invalid provider response ${JSON.stringify(response)}`, async () => {
    const service = createOpenAiService({ apiKey: 'test-key', model: 'test-model', client: { responses: { create: async () => response } } });
    await assert.rejects(service.runStructured(task));
  });
}

test('stage 8: the installed SDK serializes the structured task through its real transport', async () => {
  let sent;
  const client = new OpenAI({ apiKey: 'test-only-key', maxRetries: 0, fetch: async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'resp_test', object: 'response', status: 'completed',
      output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  } });
  const service = createOpenAiService({ apiKey: 'test-only-key', model: 'test-model', client });
  assert.deepEqual(await service.runStructured(task), { ok: true });
  assert.equal(sent.instructions, task.instructions);
  assert.equal(sent.input, JSON.stringify(task.input));
  assert.equal(sent.text.format.name, task.name);
});

test('provider output containing its configured secret is rejected without echoing it', async () => {
  const apiKey = 'sk-private-fixture-only';
  const service = createOpenAiService({ apiKey, model: 'test-model',
    client: { responses: { create: async () => ({ output_text: JSON.stringify({ ok: apiKey }) }) } } });
  await assert.rejects(service.runStructured(task), (error) => {
    assert.equal(error.message, 'Provider output rejected.');
    assert.equal(error.message.includes(apiKey), false);
    return true;
  });
});

test('stage 8: legacy callable OpenAI service retains its request and response contract', async () => {
  const fixture = JSON.parse(await readFile(new URL('./fixtures/multi_agent_response.json', import.meta.url), 'utf8'));
  let sent;
  const service = createOpenAiService({ apiKey: 'test-key', model: 'test-model', client: { responses: { create: async (body) => {
    sent = body; return { status: 'completed', output_text: JSON.stringify(fixture) };
  } } } });
  const body = { session: { sessionId: 'legacy' }, userMessage: 'test', allowedVerseIds: ['verse-1'] };
  assert.deepEqual(await service(body, { id: 'integrated' }, 'prior memory'), fixture);
  assert.equal(sent.text.format.name, 'soul_bible_turn');
  assert.equal(JSON.parse(sent.input).memorySummary, 'prior memory');
  assert.deepEqual(JSON.parse(sent.input).allowedVerseIds, ['verse-1']);
});

test('phase 2: usage callback receives only token counts and cannot break structured output', async () => {
  const service = createOpenAiService({ apiKey: 'test-key', model: 'test-model', client: { responses: { create: async () => ({
    status: 'completed', output_text: '{"ok":true}', usage: { input_tokens: 12, output_tokens: 7, internal: 'private' },
  }) } } });
  let usage;
  assert.deepEqual(await service.runStructured(task, { onUsage: (value) => { usage = value; } }), { ok: true });
  assert.deepEqual(usage, { inputTokens: 12, outputTokens: 7 });
  assert.deepEqual(await service.runStructured(task, { onUsage: () => { throw Error('sink failed'); } }), { ok: true });
});
