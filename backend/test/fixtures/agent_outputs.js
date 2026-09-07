// Provider stubs, deliberately separate from production prompts and policy rules.
export const psychologyOutput = (overrides = {}) => ({
  emotionSummary: '마음이 복잡하시군요.', supportNeed: '안정과 쉼', suggestedTone: 'gentle', avoid: [], ...overrides,
});
export const religionOutput = (overrides = {}) => ({
  perspective: '자신에게 익숙한 신앙의 관점에서 마음을 천천히 돌아보셔도 좋겠습니다.',
  guidance: '원하시면 잠시 쉬며 지금 필요한 돌봄을 하나 정해 보세요.',
  reflectionQuestion: '지금 가장 필요한 것은 무엇인가요?', sourceRefs: [], cautions: [], ...overrides,
});
