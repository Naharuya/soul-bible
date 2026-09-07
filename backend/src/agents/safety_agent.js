import { assessCrisis, crisisResponse } from '../crisis.js';

// Retain every existing risk level, including passive ideation and psychosis signals.
export function assessSafety(context) {
  const assessment = assessCrisis(context.userMessage);
  return assessment.level > 0 ? crisisResponse(context.emotion, assessment) : null;
}
