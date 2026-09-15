import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createFeedbackMetrics } from '../src/feedback.js';

test('feedback accepts only bounded categories, deduplicates retries and protects admin aggregates', async t => {
  let modelCalls = 0;
  const app = createApp({ generate: async () => { modelCalls++; throw Error('must not call'); },
    memberStore: {}, appToken: 'feedback-app-fixture', adminToken: 'feedback-admin-fixture' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const payload = { submissionId: 'a'.repeat(32), rating: 'helpful', reason: 'voice' };
  const send = (body, token = 'feedback-app-fixture') => fetch(base + '/v1/feedback', {
    method: 'POST', headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  assert.equal((await send(payload, 'wrong')).status, 401);
  for (const body of [{ ...payload, conversation: 'private text' }, { ...payload, reason: 'private input' }, { ...payload, rating: 'unknown' }]) {
    const response = await send(body);
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes('private'));
  }
  for (let retry = 0; retry < 2; retry++) {
    const response = await send(payload);
    assert.equal(response.status, 202);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(base + '/v1/admin/feedback')).status, 401);
  const response = await fetch(base + '/v1/admin/feedback', { headers: { authorization: 'Bearer feedback-admin-fixture' } });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const summary = await response.json();
  assert.deepEqual(summary.counts, { 'helpful:voice': 1 });
  assert.equal(summary.scope, 'since_process_start');
  assert.ok(!JSON.stringify(summary).includes(payload.submissionId));
  assert.equal(modelCalls, 0);
});

test('feedback metrics are isolated and only have fixed counter dimensions', () => {
  const first = createFeedbackMetrics();
  first.add({ submissionId: 'b'.repeat(32), rating: 'not_helpful', reason: 'relevance' });
  const result = first.overview();
  result.counts['not_helpful:relevance'] = 999;
  assert.equal(first.overview().counts['not_helpful:relevance'], 1);
  assert.deepEqual(createFeedbackMetrics().overview().counts, {});
});
