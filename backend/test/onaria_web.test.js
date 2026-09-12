import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createApp } from '../src/app.js';
import { adminAuth } from '../src/admin_auth.js';
import { createWebMetrics, modelUsageSample } from '../src/web_metrics.js';

async function serve(t, options = {}) {
  const app = createApp({ generate: async () => ({}), memberStore: { getAdminOverview: () => ({ total: 0, recent: [] }) }, adminToken: 'web-test-admin-credential', ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('public routes have unique canonical SEO and do not disclose operational data', async t => {
  const base = await serve(t);
  for (const path of ['/', '/about', '/services', '/traditions', '/privacy', '/terms']) {
    const response = await fetch(base + path); const text = await response.text();
    assert.equal(response.status, 200); assert.match(text, /<html lang="ko">/);
    assert.ok(text.includes(`rel="canonical" href="https://onaria.ai.kr${path}"`));
    assert.match(text, /og:image/); assert.match(text, /본문 바로가기/);
    assert.ok(!text.includes('web-test-admin-credential')); assert.ok(!text.includes('memberRows'));
  }
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  assert.equal((sitemap.match(/<loc>/g) || []).length, 6); assert.ok(!sitemap.includes('/admin'));
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/admin/);
  const social = await fetch(base + '/assets/social-preview.png');
  assert.equal(social.status, 200);
  const png = Buffer.from(await social.arrayBuffer());
  assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  for (const path of ['/admin/dashboard', '/admin/users', '/admin/ai-usage', '/admin/safety', '/admin/content', '/admin/analytics', '/admin/system']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200); assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await response.text(), /id="dashboard" class="hidden"/);
  }
  for (const path of ['/.env', '/admin/.env', '/assets/.env', '/src/server.js', '/data/members.sqlite']) assert.equal((await fetch(base + path)).status, 404);
});
test('production rejects plain HTTP and untrusted spoofed proxy headers, including legacy bearer', async t => {
  const base = await serve(t, { production: true });
  for (const path of ['/admin', '/admin/admin.js', '/v1/admin/overview', '/v1/admin/session']) {
    assert.equal((await fetch(base + path, { headers: { 'x-forwarded-proto': 'https', authorization: 'Bearer web-test-admin-credential' } })).status, 426);
  }
  assert.equal((await fetch(base + '/health')).status, 200);
});
test('secure cookie login, session restore, CSRF, logout and production bearer separation', async t => {
  const base = await serve(t, { production: true, trustProxy: 'loopback', adminSettings: { status: () => ({ configured: false }), update: () => ({ configured: true }) } });
  const forwarded = { 'x-forwarded-proto': 'https' };
  const origin = base.replace('http:', 'https:');
  const login = headers => fetch(base + '/v1/admin/session', { method: 'POST', headers: { ...forwarded, 'content-type': 'application/json', ...headers }, body: JSON.stringify({ token: 'web-test-admin-credential' }) });
  assert.equal((await login({ origin: 'https://evil.invalid' })).status, 403);
  const response = await login({ origin });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('set-cookie');
  for (const marker of ['__Host-onaria_admin=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(setCookie.includes(marker), marker);
  assert.ok(!setCookie.includes('web-test-admin-credential'));
  const { csrfToken } = await response.json();
  const cookie = setCookie.split(';')[0];
  const headers = { ...forwarded, cookie };
  const overview = await fetch(base + '/v1/admin/overview', { headers });
  assert.equal(overview.status, 200); assert.equal(overview.headers.get('cache-control'), 'no-store');
  const data = await overview.json(); assert.equal(data.metrics.activeSessions, null); assert.equal(data.operations.retentionD1, null);
  assert.equal((await fetch(base + '/v1/admin/overview', { headers: { ...forwarded, authorization: 'Bearer web-test-admin-credential' } })).status, 401);
  for (const extra of [{}, { origin }, { origin: 'https://evil.invalid', 'x-csrf-token': csrfToken }]) {
    assert.equal((await fetch(base + '/v1/admin/settings', { method: 'DELETE', headers: { ...headers, ...extra } })).status, 403);
  }
  assert.equal((await fetch(base + '/v1/admin/settings', { method: 'DELETE', headers: { ...headers, origin, 'x-csrf-token': csrfToken } })).status, 200);
  assert.equal((await (await fetch(base + '/v1/admin/session', { headers })).json()).csrfToken, csrfToken);
  assert.equal((await fetch(base + '/v1/admin/session', { method: 'DELETE', headers: { ...headers, origin, 'x-csrf-token': csrfToken } })).status, 204);
  assert.equal((await fetch(base + '/v1/admin/overview', { headers })).status, 401);
});
test('admin session expiry and login throttling are enforced', async t => {
  let time = 0;
  const app = express(); app.use(express.json()); app.use(adminAuth({ token: 'fixture', now: () => time, ttlMs: 1000 }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = token => fetch(base + '/session', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  const cookie = (await login('fixture')).headers.get('set-cookie').split(';')[0];
  time = 1001;
  assert.equal((await fetch(base + '/session', { headers: { cookie } })).status, 401);
  for (let i = 0; i < 4; i++) assert.equal((await login('incorrect')).status, 401);
  assert.equal((await login('incorrect')).status, 429);
});
test('safety metrics contain only bounded aggregates and unknown costs stay unknown', () => {
  const metrics = createWebMetrics();
  metrics.safety({ level: 2, kind: 'self_harm', userMessage: 'PRIVATE_TEXT' });
  metrics.safety({ level: 2, kind: 'self_harm', userMessage: 'PRIVATE_TEXT' });
  metrics.result({ fallback: true, routedTradition: 'catholic' });
  assert.equal(metrics.overview().safety[0].count, 2);
  assert.equal(metrics.overview().fallbackRate, 1);
  assert.equal(metrics.overview().traditions.catholic, 1);
  assert.ok(!JSON.stringify(metrics.overview()).includes('PRIVATE_TEXT'));
  const sample = modelUsageSample({ entries: () => [{ model: 'model', modelTier: 'cheap', modelCalls: 1, estimatedCostUsd: null, cachedInputTokens: 9, sessionId: 'PRIVATE_SESSION' }] });
  assert.equal(sample.rows[0].estimatedCostUsd, null); assert.equal(sample.rows[0].tier, 'Luna');
  assert.equal(sample.rows[0].cachedInputTokens, 9); assert.ok(!JSON.stringify(sample).includes('PRIVATE_SESSION'));
});
test('browser code never persists credentials and PWA shell excludes sensitive APIs', async () => {
  const js = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');
  assert.ok(!/(?:localStorage|sessionStorage)\.setItem/.test(js));
  assert.ok(!js.includes('Bearer ${')); assert.match(js, /X-CSRF-Token/);
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  assert.ok(!sw.includes('/v1/')); assert.match(sw, /SHELL.includes/);
});

test('session cost percentiles group calls without exposing identifiers or treating missing usage as zero', () => {
  const entries = [
    { userId: 'private-owner', sessionId: 'one', model: 'fixture', modelTier: 'cheap', modelCalls: 1, estimatedCostUsd: 0.001 },
    { userId: 'private-owner', sessionId: 'one', model: 'fixture', modelTier: 'cheap', modelCalls: 1, estimatedCostUsd: 0.002 },
    { userId: 'private-owner', sessionId: 'two', model: 'fixture', modelTier: 'premium', modelCalls: 1, estimatedCostUsd: 0.009 },
  ];
  const sample = modelUsageSample({ entries: () => entries });
  assert.equal(sample.sessionCosts.sessionCount, 2);
  assert.equal(sample.sessionCosts.p50CostUsd, 0.003);
  assert.equal(sample.sessionCosts.p90CostUsd, 0.009);
  assert.equal(sample.scope, 'recent_sample');
  assert.ok(!JSON.stringify(sample).includes('private-owner'));
  entries.push({ ...entries[0], estimatedCostUsd: null });
  const unknown = modelUsageSample({ entries: () => entries });
  assert.equal(unknown.sessionCosts.unknownSessions, 1);
  assert.equal(unknown.sessionCosts.p50CostUsd, null);
  assert.equal(unknown.sessionCosts.p90CostUsd, null);
  assert.equal(modelUsageSample({ entries: () => [] }).sessionCosts.p50CostUsd, null);
});
