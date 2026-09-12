import { Router } from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import rateLimit from 'express-rate-limit';

const digest = value => createHash('sha256').update(String(value)).digest();
const equal = (a, b) => timingSafeEqual(digest(a), digest(b));

// Single-process sessions intentionally expire on restart. The ADMIN_TOKEN is
// only a login credential; it is never returned or stored in browser storage.
export function adminAuth({ token, production = false, allowBearer = !production, now = Date.now, ttlMs = 30 * 60_000 }) {
  const router = Router();
  const sessions = new Map();
  const cookieName = production ? '__Host-onaria_admin' : 'onaria_admin_dev';
  const options = { httpOnly: true, secure: production, sameSite: 'strict', path: '/' };
  const prune = () => { for (const [key, session] of sessions) if (session.expires <= now()) sessions.delete(key); };
  const sessionKey = req => {
    const value = (req.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return value ? digest(value).toString('hex') : '';
  };
  const sameOrigin = req => req.get('origin') === `${req.protocol}://${req.get('host')}`;
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    if (production && !req.secure) return res.status(426).json({ message: 'HTTPS 연결이 필요합니다.' });
    prune();
    next();
  });
  router.post('/session', rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false }), (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ message: '동일한 사이트에서 로그인하세요.' });
    if (!token || typeof req.body?.token !== 'string' || !equal(req.body.token, token)) return res.status(401).json({ message: '관리자 인증키를 확인하세요.' });
    if (sessions.size >= 100) return res.status(503).json({ message: '잠시 후 다시 시도하세요.' });
    sessions.delete(sessionKey(req));
    const id = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    sessions.set(digest(id).toString('hex'), { csrfToken, expires: now() + ttlMs });
    res.cookie(cookieName, id, { ...options, maxAge: ttlMs });
    return res.json({ authenticated: true, csrfToken, expiresInSeconds: ttlMs / 1000 });
  });
  router.use((req, res, next) => {
    // Retained for trusted server tooling in development; production opt-in only.
    if (allowBearer && token && equal(req.get('authorization') || '', `Bearer ${token}`)) return next();
    const session = sessions.get(sessionKey(req));
    if (!session) return res.status(401).json({ message: '관리자 인증이 필요합니다.' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!sameOrigin(req) || !equal(req.get('x-csrf-token') || '', session.csrfToken))) {
      return res.status(403).json({ message: '인증을 새로 확인한 뒤 다시 시도하세요.' });
    }
    res.locals.adminSession = session;
    next();
  });
  router.get('/session', (_req, res) => res.json({ authenticated: true, csrfToken: res.locals.adminSession?.csrfToken ?? null }));
  router.delete('/session', (req, res) => {
    sessions.delete(sessionKey(req));
    res.clearCookie(cookieName, options);
    res.status(204).end();
  });
  return router;
}
