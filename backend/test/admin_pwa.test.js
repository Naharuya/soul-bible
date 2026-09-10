import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createApp } from '../src/app.js';

test('API key form sends authenticated write, clears secret and ignores response after logout', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', disabled: false, handlers: {},
      classList: { add() {}, remove() {} }, replaceChildren() {}, addEventListener(name, fn) { this.handlers[name] = fn; } });
    return elements.get(id);
  };
  let resolveResponse;
  let request;
  const context = vm.createContext({ document: { getElementById: element },
    sessionStorage: { getItem: () => '', removeItem() {}, setItem: () => assert.fail('API key must not be persisted in browser storage') },
    window: { confirm: () => true }, Intl,
    fetch: (url, options) => { request = { url, options }; return new Promise(resolve => { resolveResponse = resolve; }); },
  });
  vm.runInContext(await readFile(new URL('../public/admin.js', import.meta.url), 'utf8'), context);
  vm.runInContext("token = 'test-admin'", context);
  element('apiKeyInput').value = 'sk-test-private-value';
  const saving = vm.runInContext("changeKey('PUT')", context);
  assert.equal(element('apiKeyInput').value, '');
  assert.equal(request.options.headers.Authorization, 'Bearer test-admin');
  assert.equal(JSON.parse(request.options.body).apiKey, 'sk-test-private-value');
  element('logoutButton').handlers.click();
  resolveResponse({ ok: true, status: 200, json: () => assert.fail('Stale settings must not render') });
  await saving;
  assert.equal(element('keyMessage').textContent, '');
});

test('serves installable admin shell and protects live data from caching', async () => {
  const app = createApp({ generate: async () => ({}), adminToken: 'test-admin', memberStore: { getAdminOverview: () => ({ total: 0, recent: [] }) } });
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/admin/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /rel="manifest"/);
    const manifest = await (await fetch(`${base}/admin/manifest.webmanifest`)).json();
    assert.equal(manifest.start_url, '/admin/');
    assert.equal(manifest.scope, '/admin/');
    assert.equal(manifest.display, 'standalone');
    for (const icon of manifest.icons) {
      const response = await fetch(`${base}${icon.src}`);
      assert.equal(response.status, 200);
      const png = Buffer.from(await response.arrayBuffer());
      assert.equal(png.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
    }
    for (let request = 0; request < 22; request++) assert.equal((await fetch(`${base}/admin/sw.js`)).status, 200);
    const unauthenticated = await fetch(`${base}/v1/admin/overview`);
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('cache-control'), 'no-store');
    const authenticated = await fetch(`${base}/v1/admin/overview`, { headers: { authorization: 'Bearer test-admin' } });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.headers.get('cache-control'), 'no-store');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('service worker never intercepts admin API or authenticated requests', async () => {
  const handlers = {};
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin: 'https://admin.example' }, addEventListener: (name, handler) => { handlers[name] = handler; } },
    URL,
  });
  for (const request of [
    new Request('https://admin.example/v1/admin/overview'),
    new Request('https://admin.example/admin/', { headers: { authorization: 'Bearer test' } }),
    new Request('https://other.example/admin/'),
  ]) {
    handlers.fetch({ request, respondWith: () => assert.fail('Private request was intercepted') });
  }
});

test('install control prompts, handles installation, and explains offline state', async () => {
  const elements = Object.fromEntries(['installButton', 'installHint', 'connectionStatus'].map((id) => [id, { textContent: '', handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; } }]));
  const events = {};
  const navigator = { onLine: true, userAgent: 'Android Chrome', serviceWorker: { register: async (url, options) => {
    assert.equal(url, '/admin/sw.js');
    assert.equal(options.scope, '/admin/');
  } } };
  vm.runInNewContext(await readFile(new URL('../public/install.js', import.meta.url), 'utf8'), {
    document: { getElementById: (id) => elements[id] },
    navigator,
    window: { isSecureContext: true, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener: (name, handler) => { events[name] = handler; } },
  });
  let prompted = false;
  events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompted = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  await elements.installButton.handlers.click();
  assert.equal(prompted, true);
  events.appinstalled();
  assert.equal(elements.installButton.hidden, true);
  navigator.onLine = false;
  events.offline();
  assert.match(elements.connectionStatus.textContent, /오프라인/);
});
