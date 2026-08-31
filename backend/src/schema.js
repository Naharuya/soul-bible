import { z } from 'zod';

export const emotions = ['불안', '외로움', '지침', '분노', '슬픔', '복잡함', '감사', '기타'];
export const stages = ['emotion', 'situation', 'thought', 'need', 'verse_offer', 'verse_reflection', 'action', 'summary', 'crisis'];

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
}).strict();

export const responseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'question', 'stage', 'detectedEmotion', 'secondaryEmotion', 'riskLevel', 'shouldOfferVerse', 'verseTags', 'actionTags', 'shouldEndConversation', 'suggestedVerseId'],
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
  },
};
