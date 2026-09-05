import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { assessCrisis, crisisResponse } from './crisis.js';
import { requestSchema, responseSchema } from './schema.js';
import { memberSchema, publicMember } from './member_schema.js';
import { createMemberStore } from './member_store.js';
import { routeAgent } from './ai_router.js';
import { createMemoryStore } from './memory_store.js';

export function createApp({ generate, allowedOrigins = [], appToken = '', logger = console, memberStore = createMemberStore(), memoryStore = createMemoryStore() }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin(origin, cb) { cb(null, !origin || allowedOrigins.includes(origin)); } }));
  app.use(express.json({ limit: '16kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
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
      if (appToken && req.get('authorization') !== `Bearer ${appToken}`) {
        return res.status(401).json({ message: '인증이 필요합니다.' });
      }
      const body = requestSchema.parse(req.body);
      const assessment = assessCrisis(body.userMessage);
      if (assessment.level > 0) return res.json(crisisResponse(body.session.selectedEmotion, assessment));

      const agent = routeAgent({ requestedAgent: body.agentMode, userMessage: body.userMessage, verseLanguage: body.verseLanguage });
      const memorySummary = memoryStore.get(body.session.sessionId) || body.session.conversationSummary || '';
      const result = responseSchema.parse(await generate(body, agent, memorySummary));
      result.agent = agent.id;
      if (result.suggestedVerseId && !body.allowedVerseIds.includes(result.suggestedVerseId)) {
        result.suggestedVerseId = null;
        result.shouldOfferVerse = false;
      }
      if ((body.session.turnCount ?? 0) < 2) result.shouldOfferVerse = false;
      if (result.memorySummary) memoryStore.set(body.session.sessionId, result.memorySummary);
      return res.json(result);
    } catch (error) { return next(error); }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return res.status(400).json({ message: '요청 형식이 올바르지 않습니다.' });
    }
    const upstreamStatus = Number.isInteger(error?.status) ? error.status : 502;
    const status = [401, 403, 429].includes(upstreamStatus) ? upstreamStatus : 502;
    logger.error?.('request_failed', {
      name: error?.name,
      status: upstreamStatus,
      code: error?.code,
      message: error?.message,
    });
    const message = status === 429
      ? 'AI 사용량 또는 크레딧이 부족합니다.'
      : status === 401 || status === 403
        ? 'AI 인증 또는 모델 접근 권한을 확인해 주세요.'
        : 'AI 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    return res.status(status).json({ message });
  });
  return app;
}