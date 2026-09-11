import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import helmet from 'helmet';
import { appLinksRouter } from '../src/app_links.js';

async function withServer(env, run) {
  const app = express();
  app.use(helmet());
  app.use(appLinksRouter(env));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('invitation page provides configured installers and a user-initiated app link', async () => {
  await withServer({ ONARIA_ANDROID_INSTALL_URL: 'https://example.com/onaria.apk', ONARIA_IOS_INSTALL_URL: 'https://apps.apple.com/app/id123' }, async (base) => {
    const response = await fetch(`${base}/app/open`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /onaria:\/\/app\/open/);
    assert.match(html, /https:\/\/example.com\/onaria.apk/);
    assert.match(html, /https:\/\/apps.apple.com\/app\/id123/);
    assert.ok(response.headers.get('content-security-policy'));
    assert.equal((await fetch(`${base}/app/style.css`)).status, 200);
  });
});

test('unconfigured or unsafe install URLs do not create broken or executable links', async () => {
  await withServer({ ONARIA_ANDROID_INSTALL_URL: 'javascript:alert(1)', ONARIA_IOS_INSTALL_URL: 'http://example.com' }, async (base) => {
    const html = await (await fetch(`${base}/app/open`)).text();
    assert.match(html, /설치 링크를 준비 중/);
    assert.doesNotMatch(html, /javascript:|http:\/\/example/);
    assert.deepEqual(await (await fetch(`${base}/.well-known/assetlinks.json`)).json(), []);
    assert.deepEqual((await (await fetch(`${base}/.well-known/apple-app-site-association`)).json()).applinks.details, []);
  });
});

test('association files declare only the configured signing identities and invitation path', async () => {
  const fingerprint = Array(32).fill('AB').join(':');
  await withServer({ ONARIA_ANDROID_SHA256: `${fingerprint},invalid`, ONARIA_APPLE_APP_ID: 'AB12345678.com.example.bibleMindCore' }, async (base) => {
    const android = await (await fetch(`${base}/.well-known/assetlinks.json`)).json();
    assert.deepEqual(android[0].target.sha256_cert_fingerprints, [fingerprint]);
    assert.equal(android[0].target.package_name, 'com.example.bible_mind_core');
    const ios = await (await fetch(`${base}/.well-known/apple-app-site-association`)).json();
    assert.deepEqual(ios.applinks.details[0].paths, ['/app/open']);
  });
});
