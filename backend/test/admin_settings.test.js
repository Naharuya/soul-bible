import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdminSettings } from '../src/admin_settings.js';
import { createApp } from '../src/app.js';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'onaria-admin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const used = [];
  const options = { directory, env: { OPENAI_API_KEY: 'sk-environment-test' }, usageLedger: {}, factory: ({ env }) => {
    const service = async () => { used.push(env.OPENAI_API_KEY); };
    service.mode = env.OPENAI_API_KEY ? 'multi-agent conversation' : 'local conversation';
    return service;
  } };
  return { directory, options, used, settings: createAdminSettings(options) };
}
test('encrypted key survives restart, replaces runtime provider and deletion overrides environment', async t => {
  const { directory, options, used, settings } = fixture(t);
  assert.equal(settings.status().source, 'environment');
  const key = 'sk-private-replacement';
  settings.update(key);
  await settings.generate();
  assert.equal(used.at(-1), key);
  assert.ok(!readFileSync(join(directory, 'settings.enc'), 'utf8').includes(key));
  assert.ok(!JSON.stringify(settings.status()).includes(key));
  const restarted = createAdminSettings(options);
  await restarted.generate();
  assert.equal(used.at(-1), key);
  restarted.update('');
  const deleted = createAdminSettings(options);
  await deleted.generate();
  assert.equal(used.at(-1), '');
  assert.equal(deleted.status().configured, false);
});
test('admin API rejects unauthenticated writes, validates key, never returns it and disables caching', async t => {
  const { settings } = fixture(t);
  const server = createApp({ generate: settings.generate, adminSettings: settings, adminToken: 'admin-test', memberStore: {} }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/v1/admin/settings`;
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await fetch(url, { method })).status, 401);
  const headers = { authorization: 'Bearer admin-test', 'content-type': 'application/json' };
  assert.equal((await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ apiKey: 'bad key' }) })).status, 400);
  const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ apiKey: 'sk-private-test-key' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!(await response.text()).includes('sk-private'));
  const removed = await fetch(url, { method: 'DELETE', headers });
  assert.equal((await removed.json()).configured, false);
});
test('provider rebuild failure preserves previous saved and live configuration', t => {
  const { settings, options } = fixture(t);
  settings.update('sk-previous-test-key');
  const failing = createAdminSettings({ ...options, factory: args => {
    if (args.env.OPENAI_API_KEY === 'sk-rejected-test-key') throw Error('private');
    return options.factory(args);
  } });
  assert.throws(() => failing.update('sk-rejected-test-key'));
  assert.deepEqual(failing.status(), settings.status());
  assert.deepEqual(createAdminSettings(options).status(), settings.status());
});
