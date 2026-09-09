import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeContext } from '../src/agents/conversation_orchestrator.js';
import { requestSchema } from '../src/schema.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { costBody } from './fixtures/cost_fixtures.js';

test('custom feeling is validated and retained in AI context and local question', async () => {
  const body = costBody();
  body.session.customEmotion = '설레지만 조금 걱정돼요';
  const parsed = requestSchema.parse(body);
  assert.equal(normalizeContext(parsed, '').customEmotion, body.session.customEmotion);
  const response = await createLocalConversationService()(parsed, { id: 'integrated' });
  assert.ok(response.question.includes(body.session.customEmotion));
  assert.ok(response.question.endsWith('?'));
  for (const invalid of [42, {}, '가'.repeat(101)]) {
    assert.equal(requestSchema.safeParse({ ...body, session: { ...body.session, customEmotion: invalid } }).success, false);
  }
});
