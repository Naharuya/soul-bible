import { assessRequestCrisis, crisisResponse } from '../crisis.js';

// Retain every existing risk level, including passive ideation and psychosis signals.
export function assessSafety(context) {
  const assessment = assessRequestCrisis({ userMessage: context.userMessage, session: context.conversationState });
  return assessment.level > 0 ? crisisResponse(context.emotion, assessment) : null;
}
