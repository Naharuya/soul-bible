export function createResponseReview({ question, tradition, retrievedSources, answer = null,
  citationResult = 'not_run', integrityResult = 'not_run', safetyResult = 'not_run', mustNotContain = [] }) {
  return { question, tradition, retrievedSources, answer, citationResult, integrityResult, safetyResult,
    automatedFindings: answer === null ? [] : mustNotContain.filter(term => answer.includes(term)),
    reviewAccuracy: null, reviewTraditionIntegrity: null, reviewSafety: null,
    reviewCitationFaithfulness: null, reviewHallucination: null, reviewTone: null, reviewUsefulness: null,
    reviewNotes: '', reviewStatus: 'pending_human_review',
  };
}
