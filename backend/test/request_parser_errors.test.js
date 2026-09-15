import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

for (const fixture of [
  { name: 'oversized JSON', status: 413, body: JSON.stringify({ value: 'private-fixture-'.repeat(1200) }), headers: {} },
  { name: 'unsupported charset', status: 415, body: '{}', headers: { 'content-type': 'application/json; charset=iso-8859-1' } },
  { name: 'unsupported content encoding', status: 415, body: '{}', headers: { 'content-encoding': 'private-fixture-encoding' } },
]) {
  test(`request parser: ${fixture.name} remains a client error with no side effects`, async t => {
    let modelCalls = 0, memberWrites = 0;
    const logs = [];
    const app = createApp({
      generate: async () => { modelCalls++; throw Error('Unexpected generation'); },
      memberStore: { create() { memberWrites++; throw Error('Unexpected persistence'); } },
      logger: { error: (...args) => logs.push(args) },
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const route of ['/v1/mind/chat', '/v1/auth/signup', '/v1/feedback']) {
      const response = await fetch(base + route, {
        method: 'POST', headers: { 'content-type': 'application/json', ...fixture.headers }, body: fixture.body,
      });
      assert.equal(response.status, fixture.status, route);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const result = await response.json();
      assert.deepEqual(Object.keys(result), ['message']);
      assert.doesNotMatch(result.message, /private-fixture|AI|Error|stack/);
    }
    assert.equal(modelCalls, 0);
    assert.equal(memberWrites, 0);
    assert.deepEqual(logs, [], 'Invalid requests must not be logged as provider failures');
    assert.equal((await fetch(base + '/health')).status, 200);
  });
}
