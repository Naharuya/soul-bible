import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

const safeResult = { message: '많이 버거우셨겠어요.', question: '그때 어떤 생각이 가장 먼저 들었나요?', stage: 'thought', detectedEmotion: '불안', secondaryEmotion: null, riskLevel: 0, shouldOfferVerse: false, verseTags: [], actionTags: [], shouldEndConversation: false, suggestedVerseId: null };
let server; let baseUrl; let calls = 0;
before(async () => {
  const app = createApp({ generate: async () => { calls += 1; return structuredClone(safeResult); }, logger: { error() {} } });
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

function body(message = '요즘 마음이 무겁습니다') {
  return { session: { sessionId: 's1', selectedEmotion: '불안', emotionIntensity: 7, turnCount: 1 }, userMessage: message, systemPromptVersion: 'ko-v1', allowedVerseIds: [], locale: 'ko-KR' };
}
test('health endpoint', async () => assert.equal((await fetch(`${baseUrl}/health`)).status, 200));
test('returns validated model response', async () => {
  const res = await fetch(`${baseUrl}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) });
  assert.equal(res.status, 200); assert.equal((await res.json()).stage, 'thought'); assert.equal(calls, 1);
});
test('intercepts crisis before model call', async () => {
  const beforeCalls = calls;
  const res = await fetch(`${baseUrl}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body('지금 당장 죽고 싶고 계획을 세웠어요')) });
  const json = await res.json(); assert.equal(json.stage, 'crisis'); assert.equal(json.riskLevel, 3); assert.equal(calls, beforeCalls);
});
test('rejects invalid payload', async () => {
  const res = await fetch(`${baseUrl}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 400);
});
