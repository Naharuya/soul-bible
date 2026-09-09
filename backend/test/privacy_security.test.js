import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { adminMember } from '../src/member_schema.js';

test('admin overview masks identity and never exposes full church membership', () => {
    const member = adminMember({ name: '테스트회원', phone: '01012345678', church_name: '테스트교회', login_provider: 'phone' });
    assert.equal(member.name, '테***');
    assert.equal(member.phone, '010****5678');
    assert.equal(member.churchName, '비공개');
});

test('errors never log provider text, request body, credentials or stacks; API is no-store', async (t) => {
  const logs = [];
  const marker = 'private-fixture-must-not-appear';
  const app = createApp({ memberStore: {}, logger: { error: (...args) => logs.push(args) },
    generate: async () => { throw Object.assign(new Error(marker), { name: marker, code: marker, status: 503, request: { body: marker } }); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${marker}` }, body: JSON.stringify({
    session: { sessionId: 'privacy-fixture', selectedEmotion: '불안', emotionIntensity: 4 },
    userMessage: marker, systemPromptVersion: 'ko-v1', allowedVerseIds: [],
  }) });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(logs, [['request_failed', { status: 503 }]]);
  assert.equal((await response.text()).includes(marker), false);
  const invalid = await fetch(`${base}/v1/mind/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get('cache-control'), 'no-store');
  for (const path of ['/data/members.sqlite', '/members.sqlite', '/.env', '/admin/../data/members.sqlite']) {
    assert.equal((await fetch(`${base}${path}`)).status, 404);
  }
});
