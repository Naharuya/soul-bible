import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { assessCrisis, crisisResponse } from './crisis.js';
import { requestSchema, responseSchema } from './schema.js';

export function createApp({ generate, allowedOrigins = [], appToken = '', logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin(origin, cb) { cb(null, !origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)); } }));
  app.use(express.json({ limit: '16kb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/v1/mind/chat', async (req, res, next) => {
    try {
      if (appToken && req.get('authorization') !== `Bearer ${appToken}`) {
        return res.status(401).json({ message: '인증이 필요합니다.' });
      }
      const body = requestSchema.parse(req.body);
      const assessment = assessCrisis(body.userMessage);
      if (assessment.level > 0) return res.json(crisisResponse(body.session.selectedEmotion, assessment));

      const result = responseSchema.parse(await generate(body));
      if (result.suggestedVerseId && !body.allowedVerseIds.includes(result.suggestedVerseId)) {
        result.suggestedVerseId = null;
        result.shouldOfferVerse = false;
      }
      if ((body.session.turnCount ?? 0) < 3) result.shouldOfferVerse = false;
      return res.json(result);
    } catch (error) { return next(error); }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return res.status(400).json({ message: '요청 형식이 올바르지 않습니다.' });
    }
    logger.error?.('request_failed', { name: error?.name, message: error?.message });
    return res.status(502).json({ message: 'AI 응답을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  });
  return app;
}
