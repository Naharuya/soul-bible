import { psychologyOutput, religionOutput } from './agent_outputs.js';

export const costEnv = { SOUL_COST_ROUTER_V1_ENABLED: 'false', SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only-cost-key',
  OPENAI_MODEL: 'mock', OPENAI_CHEAP_MODEL: 'mock-cheap', OPENAI_STANDARD_MODEL: 'mock-standard', OPENAI_PREMIUM_MODEL: 'mock-premium',
  SOUL_MODEL_PRICING_JSON: JSON.stringify(Object.fromEntries(['mock', 'mock-cheap', 'mock-standard', 'mock-premium']
    .map(model => [model, { input: 0.01, cachedInput: 0.002, output: 0.02 }]))) };
// Synthetic rates above are arithmetic fixtures, not actual API prices.
export const costBody = (userMessage = '내일 발표가 걱정돼요') => ({
  session: { sessionId: 'mock-session', selectedEmotion: '불안', emotionIntensity: 7, turnCount: 1 },
  userMessage, systemPromptVersion: 'ko-v1', allowedVerseIds: [], religion: 'protestant',
});
export function costFactory(calls = []) {
  return ({ model }) => ({ runStructured: async (task, options) => {
    calls.push({ model, name: task.name });
    options.onUsage?.({ inputTokens: 1000, cachedInputTokens: 400, outputTokens: 100 });
    return task.name === 'psychology_reflection' ? psychologyOutput() : religionOutput();
  } });
}
export const costKnowledge = {
  async search(search) {
    const source = { sourceId: 'protestant:cost-fixture:1', tradition: 'protestant', sourceType: 'pastoral',
      title: '합성 테스트 자료', reference: '합성 테스트 자료 1', text: '잠시 쉬어 보셔도 괜찮습니다.',
      language: 'ko-KR', authorityLevel: 'primary',
      metadata: { sample: false, license: 'Synthetic test fixture', licenseStatus: 'self_authored',
        licenseNote: 'Only for isolated automated tests', provenance: 'Synthetic fixture',
        importedAt: '2026-01-01T00:00:00.000Z', traditionBranch: 'general', qualityScore: 1, keywords: ['위로'] } };
    return { tradition: search.tradition, query: search.query, results: [source],
      diagnostics: { retrievalMode: 'keyword', fallbackReason: null, scores: [{ sourceId: source.sourceId, keywordScore: 1, vectorScore: 0, rerankScore: 1 }] } };
  },
};
