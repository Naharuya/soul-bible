// Offline reproductions of issues discovered in REAL. No dotenv or network calls.
import OpenAI from 'openai';
import { writeFileSync } from 'node:fs';
import { createConversationService } from '../src/conversation_service.js';
import { assessRequestCrisis } from '../src/crisis.js';
let calls = 0; const events = [];
const service = createConversationService({ env: { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true',
  OPENAI_API_KEY: 'offline-fixture', SOUL_EXTERNAL_API_DISABLED: 'false' },
  logger: { info: (_event, data) => events.push(data), warn() {} },
  openAiFactory: () => ({ runStructured: async () => { calls++; throw new OpenAI.APIConnectionTimeoutError(); } }),
});
const body = { session: { sessionId: 'offline-diagnostic', selectedEmotion: '불안', emotionIntensity: 6, turnCount: 0 },
  userMessage: '오늘 피곤해요', systemPromptVersion: 'ko-v1', allowedVerseIds: [] };
await service(body);
const timeout = new OpenAI.APIConnectionTimeoutError();
const timeoutClassification = { sdkName: timeout.name, sdkConstructor: timeout.constructor.name, actualFallbackReason: events.at(-1).fallbackReason, expectedFallbackReason: 'timeout' };
const crisisMiss = assessRequestCrisis({ ...body, userMessage: '지금 자해할 생각과 계획이 있습니다.' });
const before = calls;
const positive = await service({ ...body, userMessage: '자해하고 싶어요' });
const report = { paidCalls: 0, timeoutClassification, crisisMiss,
  positiveControl: { modelCalls: calls - before, stage: positive.stage, riskLevel: positive.riskLevel } };
writeFileSync('../build/cost-v1-offline-diagnostics.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
