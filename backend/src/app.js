import cors from 'cors';
import express from 'express';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { assessRequestCrisis, crisisResponse } from './crisis.js';
import { logSafetyAssessment } from './safety_event.js';
import { requestSchema, responseSchema } from './schema.js';
import { memberSchema, publicMember } from './member_schema.js';
import { createMemberStore } from './member_store.js';
import { routeAgent } from './ai_router.js';
import { IdentityError } from './auth/identity_verifier.js';
import { appLinksRouter } from './app_links.js';
import { adminAuth } from './admin_auth.js';
import { websiteRouter } from './website.js';
import { createWebMetrics, modelUsageSample } from './web_metrics.js';

export function createApp({ generate, adminSettings, allowedOrigins = [], appToken = '', adminToken = '', logger = console, memberStore = createMemberStore(), identity = { required: false, verify: null }, production = false, trustProxy = false, publicOrigin = 'https://onaria.ai.kr', allowAdminBearer = !production, webMetrics = createWebMetrics() }) {
  const app = express();
  const startedAt = new Date();
  const metrics = { requests: 0, chats: 0, crises: 0, errors: 0, statusCodes: {} };
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(helmet());
  app.use(appLinksRouter());
  app.use(cors({ origin(origin, cb) { cb(null, !origin || allowedOrigins.includes(origin)); } }));
  app.use('/v1', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/v1', rateLimit({ windowMs: 60_000, limit: 20, skip: req => /^\/admin(?:\/|$)/.test(req.path), standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/v1/admin', rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use((req, res, next) => {
    metrics.requests += 1;
    res.on('finish', () => {
      const key = String(res.statusCode);
      metrics.statusCodes[key] = (metrics.statusCodes[key] || 0) + 1;
      if (res.statusCode >= 500) metrics.errors += 1;
    });
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/v1/admin', adminAuth({ token: adminToken, production, allowBearer: allowAdminBearer }));
  app.use('/v1/admin/settings', (req, res, next) => {
    if (!adminSettings) return res.status(503).json({ message: '설정 저장소를 사용할 수 없습니다.' });
    next();
  });
  app.get('/v1/admin/settings', (_req, res) => {
    try { return res.json(adminSettings.status()); }
    catch { return res.status(503).json({ message: '설정을 불러오지 못했습니다.' }); }
  });
  app.put('/v1/admin/settings', (req, res) => {
    const apiKey = req.body?.apiKey;
    if (typeof apiKey !== 'string' || !/^sk-[A-Za-z0-9_-]{10,500}$/.test(apiKey)) return res.status(400).json({ message: 'OpenAI API 키 형식을 확인해 주세요.' });
    try { return res.json(adminSettings.update(apiKey)); }
    catch { return res.status(503).json({ message: '저장하지 못했습니다. 기존 설정을 유지합니다.' }); }
  });
  app.delete('/v1/admin/settings', (_req, res) => {
    try { return res.json(adminSettings.update('')); }
    catch { return res.status(503).json({ message: '삭제하지 못했습니다. 다시 시도해 주세요.' }); }
  });
  app.use('/admin', (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    if (production && !req.secure) return res.status(426).type('text').send('HTTPS required');
    next();
  });
  app.get(['/admin', '/admin/', ...['dashboard', 'users', 'ai-usage', 'safety', 'content', 'analytics', 'system'].map(p => `/admin/${p}`)], (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(fileURLToPath(new URL('../public/admin.html', import.meta.url)));
  });
  app.use('/admin', express.static(fileURLToPath(new URL('../public', import.meta.url)), { index: false, maxAge: 0, dotfiles: 'deny' }));
  app.use(websiteRouter({ publicOrigin }));
  app.get('/v1/admin/overview', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const members = memberStore.getAdminOverview?.() ?? { total: null, recent: [] };
    let aiUsage = { available: false };
    let modelUsage = { available: false, rows: [] };
    try { aiUsage = generate.usageLedger?.overview() ?? aiUsage; } catch { /* Existing overview stays available. */ }
    try { modelUsage = modelUsageSample(generate.usageLedger); } catch { /* Totals remain available. */ }
    return res.json({
      generatedAt: new Date().toISOString(),
      service: {
        status: 'operational',
        mode: generate.mode || 'local conversation',
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
      },
      metrics: { ...metrics, activeSessions: null },
      members,
      aiUsage,
      modelUsage,
      operations: webMetrics.overview(),
      aiRuntime: adminSettings?.runtimeStatus?.() ?? null,
    });
  });
  app.post('/v1/auth/signup', (req, res, next) => {
    try {
      const member = memberStore.create(memberSchema.parse(req.body));
      return res.status(201).json({ member: publicMember(member) });
    } catch (error) {
      if (error.code === 'PHONE_EXISTS') return res.status(409).json({ message: error.message });
      return next(error);
    }
  });
  app.post('/v1/mind/chat', async (req, res, next) => {
    try {
      metrics.chats += 1;
      if (appToken && req.get('authorization') !== `Bearer ${appToken}`) {
        return res.status(401).json({ message: '인증이 필요합니다.' });
      }
      const body = requestSchema.parse(req.body);
      const assessment = assessRequestCrisis(body);
      logSafetyAssessment(logger, assessment);
      webMetrics.safety(assessment);
      if (assessment.level > 0) {
        metrics.crises += 1;
        try { generate.usageLedger?.reserve({ sessionId: body.session.sessionId, taskType: 'crisis' }).finish({ provider: 'safety', tier: 'local' }); } catch { /* Never gate safety. */ }
        return res.json(crisisResponse(body.session.selectedEmotion, assessment));
      }

      // Shared app authentication above is unchanged. Per-member identity uses
      // a separate credential and is never inferred from body/session fields.
      const identityToken = req.get('x-soul-identity-token');
      let trustedIdentity = {};
      if (identityToken !== undefined) {
        if (!identity.verify) throw new IdentityError();
        trustedIdentity = await identity.verify(identityToken);
        if (!trustedIdentity || typeof trustedIdentity.userId !== 'string' || !trustedIdentity.userId
          || !['free', 'premium'].includes(trustedIdentity.plan)) throw new IdentityError();
      } else if (identity.required) throw new IdentityError();

      const agent = routeAgent({ requestedAgent: body.agentMode, userMessage: body.userMessage, verseLanguage: body.verseLanguage });
      // Client session IDs are not credentials. Keep anonymous chat stateless so
      // reusing another client's ID cannot retrieve their private context.
      const memorySummary = body.session.conversationMemory || body.session.conversationSummary || '';
      const result = responseSchema.parse(await generate(body, agent, memorySummary, trustedIdentity));
      if (result.riskLevel > 0 || result.stage === 'crisis') {
        metrics.crises += 1;
        webMetrics.safety({ level: Math.max(1, result.riskLevel), kind: 'response_crisis' });
        logSafetyAssessment(logger, { level: Math.max(1, result.riskLevel), kind: 'response_crisis' });
        return res.json(crisisResponse(body.session.selectedEmotion, { level: Math.max(1, result.riskLevel) }));
      }
      result.agent = agent.id;
      if (result.suggestedVerseId && !body.allowedVerseIds.includes(result.suggestedVerseId)) {
        result.suggestedVerseId = null;
        result.shouldOfferVerse = false;
      }
      if ((body.session.turnCount ?? 0) < 2) result.shouldOfferVerse = false;
      return res.json(result);
    } catch (error) { return next(error); }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof IdentityError) return res.status(error.status).json({ message: error.message });
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return res.status(400).json({ message: '요청 형식이 올바르지 않습니다.' });
    }
    const upstreamStatus = Number.isInteger(error?.status) ? error.status : 502;
    const status = [401, 403, 429].includes(upstreamStatus) ? upstreamStatus : 502;
    try { logger.error?.('request_failed', {
      status: upstreamStatus,
    }); } catch { /* Logging failures must not expose Express's raw error page. */ }
    const message = status === 429
      ? 'AI 사용량 또는 크레딧이 부족합니다.'
      : status === 401 || status === 403
        ? 'AI 인증 또는 모델 접근 권한을 확인해 주세요.'
        : 'AI 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    return res.status(status).json({ message });
  });
  return app;
}
