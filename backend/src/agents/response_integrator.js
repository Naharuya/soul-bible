import { responseSchema } from '../schema.js';
import { psychologySchema } from './agent_contracts.js';
import { toLegacyReligion } from './specialist_result.js';

function summarize(context, psychology) {
  const current = `${psychology.emotionSummary} 필요: ${psychology.supportNeed}`;
  const previous = context.memorySummary.trim();
  // Keep prior context without appending the same observation every turn. The
  // session store remains owned by app.js; the Psychology agent does not write it.
  return previous.endsWith(current) ? previous.slice(-4000) : [previous, current].filter(Boolean).join('\n').slice(-4000);
}

export function integrateResponse({ context, psychology, religion, agent }) {
  psychology = psychologySchema.parse(psychology);
  religion = toLegacyReligion(religion);
  const state = context.conversationState;
  const turn = state.turnCount ?? 0;
  const ended = turn > 5 && !state.verseAccepted && !state.selectedVerse;
  const canOfferVerse = context.religion === 'protestant' && turn >= 2 && !ended
    && !state.verseAccepted && !state.selectedVerse && context.allowedVerseIds.length > 0;
  const stage = ended ? 'summary' : state.verseAccepted || state.selectedVerse ? 'action'
    : canOfferVerse ? 'verse_offer' : turn >= 2 ? 'action' : turn === 0 ? 'thought' : 'need';
  // Preserve legacy selection of client-owned Bible IDs without generating verse text.
  // IDs are never treated as sourceContext or offered to other religions.
  return responseSchema.parse({
    message: [psychology.emotionSummary, religion.perspective, religion.guidance, ...religion.cautions].join('\n\n'),
    question: ended || canOfferVerse ? null : religion.reflectionQuestion,
    ...(!ended && !canOfferVerse && religion.answerExamples ? { answerExamples: religion.answerExamples } : {}),
    stage, detectedEmotion: context.emotion, secondaryEmotion: null, riskLevel: 0,
    shouldOfferVerse: canOfferVerse, verseTags: [], actionTags: stage === 'action' ? ['작은 행동'] : [],
    shouldEndConversation: ended, suggestedVerseId: canOfferVerse ? context.allowedVerseIds[0] : null,
    agent: agent.id, memorySummary: summarize(context, psychology),
    // Flutter renders these nullable legacy fields again below message. Keep them
    // null to avoid repeating empathy/action or presenting observations as clinical advice.
    clinicalReflection: null, integratedInsight: null,
  });
}
