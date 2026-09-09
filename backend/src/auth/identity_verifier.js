import { createLocalJWKSet, createRemoteJWKSet, customFetch, decodeProtectedHeader, jwtVerify } from 'jose';

export class IdentityError extends Error {
  constructor(status = 401) {
    super(status === 503 ? '회원 인증을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' : '회원 인증이 필요합니다. 다시 로그인해 주세요.');
    this.name = 'IdentityError'; this.status = status;
  }
}
const allowedAlgorithms = ['RS256', 'ES256'];
const maxJwksBytes = 65536;
function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) throw new IdentityError(503);
  return url;
}
function publicJwks(value) {
  if (!value || !Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 20) throw new IdentityError(503);
  for (const key of value.keys) {
    if (!key || !['RSA', 'EC'].includes(key.kty) || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(field => Object.hasOwn(key, field))) throw new IdentityError(503);
  }
  return value;
}

export function createIdentityVerifier({ issuer, audience, jwksUrl, jwks, algorithms = ['RS256'], typ = 'JWT',
  maxTokenAgeSeconds = 3600, requiredClaims = {}, fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const issuerUrl = httpsUrl(issuer);
  if (issuerUrl.search || typeof audience !== 'string' || !audience.trim() || audience.length > 256
    || !Array.isArray(algorithms) || !algorithms.length || algorithms.some(alg => !allowedAlgorithms.includes(alg))
    || !['JWT', 'at+jwt'].includes(typ)
    || !Number.isSafeInteger(maxTokenAgeSeconds) || maxTokenAgeSeconds < 60 || maxTokenAgeSeconds > 86400
    || Boolean(jwksUrl) === Boolean(jwks)
    || !requiredClaims || typeof requiredClaims !== 'object' || Array.isArray(requiredClaims)) throw new IdentityError(503);
  const claims = Object.entries(requiredClaims);
  if (claims.length > 20 || claims.some(([key, value]) => key.length > 200 || !['string', 'boolean', 'number'].includes(typeof value)
    || (typeof value === 'number' && !Number.isFinite(value)))) throw new IdentityError(503);
  let keys;
  if (jwks) {
    if (Buffer.byteLength(JSON.stringify(jwks)) > maxJwksBytes) throw new IdentityError(503);
    keys = createLocalJWKSet(publicJwks(structuredClone(jwks)));
  } else {
    const url = httpsUrl(jwksUrl);
    keys = createRemoteJWKSet(url, { timeoutDuration: 2500, cooldownDuration: 30000, cacheMaxAge: 600000,
      [customFetch]: async (requestedUrl, options) => {
        // Only the configured trusted endpoint is contacted. No bearer token,
        // claim-derived URL, redirect or provider error body leaves this layer.
        if (String(requestedUrl) !== url.href) throw new IdentityError(503);
        const response = await fetchImpl(url.href, { method: 'GET', signal: options.signal, redirect: 'manual',
          headers: { Accept: 'application/json' } });
        if (response.status !== 200 || response.redirected || Number(response.headers.get('content-length') ?? 0) > maxJwksBytes) {
          await response.body?.cancel(); throw new IdentityError(503);
        }
        const reader = response.body?.getReader(); if (!reader) throw new IdentityError(503);
        const chunks = []; let bytes = 0;
        try {
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            bytes += value.byteLength;
            if (bytes > maxJwksBytes) { await reader.cancel(); throw new IdentityError(503); }
            chunks.push(Buffer.from(value));
          }
        } finally { reader.releaseLock(); }
        const parsed = publicJwks(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        return new Response(JSON.stringify(parsed), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });
  }
  return async token => {
    try {
      if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new IdentityError();
      const header = decodeProtectedHeader(token);
      if (typeof header.kid !== 'string' || !header.kid || header.kid.length > 128
        || Object.keys(header).some(key => !['alg', 'typ', 'kid'].includes(key))) throw new IdentityError();
      const currentDate = now();
      const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms, typ, currentDate,
        requiredClaims: ['iss', 'aud', 'sub', 'iat', 'exp'], maxTokenAge: maxTokenAgeSeconds, clockTolerance: 5 });
      if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256
        || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat < 0
        || payload.exp <= payload.iat || payload.exp - payload.iat > maxTokenAgeSeconds
        || claims.some(([key, value]) => !Object.hasOwn(payload, key) || payload[key] !== value)) throw new IdentityError();
      // Stable, issuer-qualified identity; never return the token or full claims.
      return Object.freeze({ userId: JSON.stringify([issuer, payload.sub]), subject: payload.sub });
    } catch (error) {
      if (error instanceof IdentityError) throw error;
      // Signature/claim errors and upstream details share a fixed public error.
      throw new IdentityError();
    }
  };
}

export function createEntitlementResolver(entries = [], { now = () => new Date() } = {}) {
  if (!Array.isArray(entries) || entries.length > 10000) throw new IdentityError(503);
  const grants = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.subject !== 'string' || !entry.subject || entry.subject.length > 256
      || entry.plan !== 'premium' || typeof entry.expiresAt !== 'string' || !entry.expiresAt.endsWith('Z')
      || !Number.isFinite(Date.parse(entry.expiresAt)) || grants.has(entry.subject)) throw new IdentityError(503);
    grants.set(entry.subject, Date.parse(entry.expiresAt));
  }
  // This map comes from server configuration, never signed user-editable metadata.
  return ({ subject }) => (grants.get(subject) ?? 0) > now().getTime() ? 'premium' : 'free';
}

export function createRuntimeIdentity({ env = process.env, logger = console } = {}) {
  const required = env.SOUL_AUTH_REQUIRED === 'true';
  if (env.SOUL_AUTH_ENABLED !== 'true' && !required) return { required: false, verify: null };
  try {
    if (env.SOUL_AUTH_ENABLED !== 'true') throw new IdentityError(503);
    const verify = createIdentityVerifier({ issuer: env.SOUL_AUTH_ISSUER, audience: env.SOUL_AUTH_AUDIENCE,
      jwksUrl: env.SOUL_AUTH_JWKS_URL || undefined, jwks: env.SOUL_AUTH_JWKS_JSON ? JSON.parse(env.SOUL_AUTH_JWKS_JSON) : undefined,
      algorithms: (env.SOUL_AUTH_ALGORITHMS || 'RS256').split(',').map(value => value.trim()),
      typ: env.SOUL_AUTH_JWT_TYP || 'JWT', maxTokenAgeSeconds: Number(env.SOUL_AUTH_MAX_TOKEN_AGE_SECONDS || 3600),
      requiredClaims: JSON.parse(env.SOUL_AUTH_REQUIRED_CLAIMS_JSON || '{}') });
    const planFor = createEntitlementResolver(JSON.parse(env.SOUL_AUTH_ENTITLEMENTS_JSON || '[]'));
    return { required, async verify(token) { const identity = await verify(token); return { userId: identity.userId, plan: planFor(identity) }; } };
  } catch {
    try { logger.error?.('identity_configuration_invalid'); } catch { /* No keys, tokens, subjects or error text in logs. */ }
    return { required, verify: async () => { throw new IdentityError(503); } };
  }
}
