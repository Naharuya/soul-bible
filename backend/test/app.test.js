import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { memberSchema } from '../src/member_schema.js';

const safeResult = { message: '많이 버거우셨겠어요.', question: '그때 어떤 생각이 가장 먼저 들었나요?', stage: 'thought', detectedEmotion: '불안', secondaryEmotion: null, riskLevel: 0, shouldOfferVerse: false, verseTags: [], actionTags: [], shouldEndConversation: false, suggestedVerseId: null, agent: 'integrated', memorySummary: '사용자는 마음이 무거운 상황을 돌아보고 있습니다.', clinicalReflection: '상황과 생각을 나누어 볼 수 있습니다.', integratedInsight: '마음을 말로 표현하는 시간이 될 수 있습니다.' };
let server; let baseUrl; let calls = 0;
let lastAgent;
before(async () => {
  const app = createApp({ generate: async (_body, agent) => { calls += 1; lastAgent = agent.id; return structuredClone(safeResult); }, logger: { error() {} } });
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
test('accepts every client emotion', async () => {
  const payload = body();
  payload.session.selectedEmotion = '질투';
  const res = await fetch(`${baseUrl}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(res.status, 200);
});
test('does not allow arbitrary browser origins by default', async () => {
  const res = await fetch(`${baseUrl}/health`, { headers: { origin: 'https://untrusted.example' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});
test('normalizes phone numbers before persistence', () => {
  assert.equal(memberSchema.parse({ name: '홍길동', phone: '010-1234-5678', churchName: '소망교회' }).phone, '01012345678');
});
test('routes explicit clinical reflection requests', async () => {
  const payload = body('불안한 생각을 임상심리 관점에서 성찰하고 싶어요');
  payload.agentMode = 'clinical_reflection';
  await fetch(`${baseUrl}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(lastAgent, 'clinical_reflection');
});
