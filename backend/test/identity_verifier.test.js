import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createIdentityVerifier, createRuntimeIdentity, createEntitlementResolver, IdentityError } from '../src/auth/identity_verifier.js';
import { createApp } from '../src/app.js';
import { createConversationService } from '../src/conversation_service.js';
import { costEnv, costBody, costFactory } from './fixtures/cost_fixtures.js';

const issuer = 'https://identity.example.test';
const audience = 'soul-bible';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = { keys: [{ ...await exportJWK(publicKey), kid: 'test-key' }] };
const timestamp = Math.floor(Date.now() / 1000);
const sign = (claims = {}, header = {}) => new SignJWT({ sub: 'alice', iss: issuer, aud: audience,
  iat: timestamp, exp: timestamp + 600, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT', ...header }).sign(privateKey);

test('identity validates signature, issuer, audience, lifetime and protected headers', async () => {
  const verify = createIdentityVerifier({ issuer, audience, jwks });
  assert.deepEqual(await verify(await sign()), { userId: JSON.stringify([issuer, 'alice']), subject: 'alice' });
  for (const claims of [{ iss: 'https://other.test' }, { aud: 'other' }, { exp: timestamp - 10 },
    { iat: timestamp + 60 }, { exp: timestamp + 7200 }, { sub: '' }]) {
    await assert.rejects(verify(await sign(claims)), IdentityError);
  }
  await assert.rejects(verify(await sign({}, { jku: 'https://attacker.test' })), IdentityError);
  const token = await sign();
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ sub: 'mallory' })).toString('base64url');
  await assert.rejects(verify(parts.join('.')), IdentityError);
});

test('premium entitlement comes from server grants and expires', async () => {
  const planFor = createEntitlementResolver([{ subject: 'alice', plan: 'premium', expiresAt: '2026-10-01T00:00:00Z' }],
    { now: () => new Date('2026-09-09T00:00:00Z') });
  assert.equal(planFor({ subject: 'alice' }), 'premium');
  assert.equal(planFor({ subject: 'mallory', plan: 'premium' }), 'free');
  const expired = createEntitlementResolver([{ subject: 'alice', plan: 'premium', expiresAt: '2026-09-01T00:00:00Z' }]);
  assert.equal(expired({ subject: 'alice' }), 'free');
});

test('runtime disabled and invalid required configuration fail predictably without secrets', async () => {
  assert.deepEqual(createRuntimeIdentity({ env: {} }), { required: false, verify: null });
  const logs = [];
  const identity = createRuntimeIdentity({ env: { SOUL_AUTH_REQUIRED: 'true' }, logger: { error: value => logs.push(value) } });
  assert.equal(identity.required, true);
  await assert.rejects(identity.verify('secret'), error => error.status === 503);
  assert.deepEqual(logs, ['identity_configuration_invalid']);
});

test('HTTP verified members have separate quota; forged plan and invalid credentials cannot grant access', async t => {
  const calls = [];
  const generate = createConversationService({ env: { ...costEnv, SOUL_FREE_DAILY_AI_CALLS: '1' }, openAiFactory: costFactory(calls), logger: {} });
  const verify = createIdentityVerifier({ issuer, audience, jwks });
  const app = createApp({ generate, memberStore: {}, identity: { required: true,
    verify: async token => ({ ...await verify(token), plan: 'free' }) } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (token, body = costBody()) => fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'X-Soul-Identity-Token': token } : {}) }, body: JSON.stringify(body),
  });
  assert.equal((await post()).status, 401);
  assert.equal((await post('invalid')).status, 401);
  assert.equal(calls.length, 0);
  const alice = await sign({ plan: 'premium' });
  assert.equal((await post(alice)).status, 200);
  const first = calls.length; assert.ok(first > 0);
  assert.equal((await post(alice, { ...costBody(), plan: 'premium', userId: 'mallory' })).status, 400);
  assert.equal((await post(alice)).status, 200);
  assert.equal(calls.length, first);
  assert.equal((await post(await sign({ sub: 'bob' }))).status, 200);
  assert.ok(calls.length > first);
  const beforeCrisis = calls.length;
  const crisis = await post('invalid', costBody('지금 당장 죽고 싶고 계획을 세웠어요'));
  assert.equal(crisis.status, 200);
  assert.equal((await crisis.json()).stage, 'crisis');
  assert.equal(calls.length, beforeCrisis);
});
