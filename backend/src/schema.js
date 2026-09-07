import { z } from 'zod';
import { religionSchema } from './agents/agent_contracts.js';

export const emotions = ['불안', '외로움', '지침', '분노', '슬픔', '복잡함', '감사', '기쁨', '공포', '혐오', '놀람', '행복', '기대', '감탄', '벅찬', '질투'];
export const stages = ['emotion', 'situation', 'thought', 'need', 'verse_offer', 'verse_reflection', 'action', 'summary', 'crisis', 'ended'];
export const agentIds = ['auto', 'bible_ko', 'bible_en', 'clinical_reflection', 'integrated'];

export const requestSchema = z.object({
  session: z.object({
    sessionId: z.string().min(1).max(128),
    selectedEmotion: z.enum(emotions),
    emotionIntensity: z.number().int().min(1).max(10),
    currentStage: z.string().max(32).optional(),
    turnCount: z.number().int().min(0).max(100).optional(),
    conversationSummary: z.string().max(4000).optional(),
    previousUserAnswer: z.string().max(2000).nullable().optional(),
    previousAssistantQuestion: z.string().max(1000).nullable().optional(),
    verseAccepted: z.boolean().nullable().optional(),
    selectedVerse: z.string().max(100).nullable().optional(),
    riskLevel: z.number().int().min(0).max(3).optional(),
  }).passthrough(),
  userMessage: z.string().trim().min(1).max(2000),
  systemPromptVersion: z.string().min(1).max(40),
  allowedVerseIds: z.array(z.string().min(1).max(100)).max(100),
  locale: z.literal('ko-KR').default('ko-KR'),
  agentMode: z.enum(agentIds).default('auto'),
  verseLanguage: z.enum(['korean', 'english', 'bilingual']).default('bilingual'),
  religion: religionSchema.optional(),
}).strict();

export const responseSchema = z.object({
  message: z.string().min(1).max(1200),
  question: z.string().max(500).nullable(),
  stage: z.enum(stages),
  detectedEmotion: z.enum(emotions),
  secondaryEmotion: z.string().max(40).nullable(),
  riskLevel: z.number().int().min(0).max(3),
  shouldOfferVerse: z.boolean(),
  verseTags: z.array(z.string().max(40)).max(10),
  actionTags: z.array(z.string().max(40)).max(10),
  shouldEndConversation: z.boolean(),
  suggestedVerseId: z.string().max(100).nullable(),
  agent: z.enum(['bible_ko', 'bible_en', 'clinical_reflection', 'integrated']),
  memorySummary: z.string().max(4000),
  clinicalReflection: z.string().max(800).nullable(),
  integratedInsight: z.string().max(800).nullable(),
}).strict();

export const responseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'question', 'stage', 'detectedEmotion', 'secondaryEmotion', 'riskLevel', 'shouldOfferVerse', 'verseTags', 'actionTags', 'shouldEndConversation', 'suggestedVerseId', 'agent', 'memorySummary', 'clinicalReflection', 'integratedInsight'],
  properties: {
    message: { type: 'string' },
    question: { type: ['string', 'null'] },
    stage: { type: 'string', enum: stages },
    detectedEmotion: { type: 'string', enum: emotions },
    secondaryEmotion: { type: ['string', 'null'] },
    riskLevel: { type: 'integer', minimum: 0, maximum: 3 },
    shouldOfferVerse: { type: 'boolean' },
    verseTags: { type: 'array', items: { type: 'string' } },
    actionTags: { type: 'array', items: { type: 'string' } },
    shouldEndConversation: { type: 'boolean' },
    suggestedVerseId: { type: ['string', 'null'] },
    agent: { type: 'string', enum: ['bible_ko', 'bible_en', 'clinical_reflection', 'integrated'] },
    memorySummary: { type: 'string' },
    clinicalReflection: { type: ['string', 'null'] },
    integratedInsight: { type: ['string', 'null'] },
  },
};
