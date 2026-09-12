// DRY is offline and reports conservative synthetic token bounds, not measured billing.
// REAL is explicit: node --env-file=.env scripts/cost_router_v1.js --real
import { createConversationService } from '../src/conversation_service.js';
import { readPricing } from '../src/cost/model_pricing.js';
import { responseSchema } from '../src/schema.js';

const real = process.argv.includes('--real');
if (real) {
  const { runGuardedStages, runRealPreflight } = await import('./cost_real_preflight.js');
  const { runSolDiagnostic } = await import('./cost_sol_diagnostic.js');
  const { runSolChain } = await import('./cost_sol_chain.js');
  const { runRealBenchmark } = await import('./cost_router_real.js');
  let preflightPassed = false;
  try {
    await runGuardedStages({ preflight: async () => { await runRealPreflight(); preflightPassed = true; },
      stages: [runSolDiagnostic, runSolChain, runRealBenchmark] });
  } catch {
    console.error(JSON.stringify({ status: 'REAL TEST ABORTED',
      phase: preflightPassed ? 'provider_stage' : 'preflight',
      paidCalls: preflightPassed ? 'see saved stage usage; missing usage remains unknown' : 0 }));
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}
if (real && !process.env.OPENAI_API_KEY) throw new Error('REAL requires OPENAI_API_KEY in the server environment.');
const env = real ? { ...process.env, SOUL_COST_ROUTER_V1_ENABLED: 'true' } : {
  SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'offline-stub',
};
const records = [];
const support = { emotion: '불안', empathy: '마음이 복잡하고 불안하게 느껴지셨군요.',
  nextQuestion: '지금 가장 필요한 돌봄은 무엇인가요?', summary: '불안한 감정과 돌봄의 필요' };
const service = createConversationService({ env, logger: { info: (_, data) => records.push(data) },
  ...(!real ? { openAiFactory: () => ({ runStructured: async (task, options) => {
    const inputTokens = Buffer.byteLength(JSON.stringify(task), 'utf8') + 256;
    options.onUsage({ inputTokens, cachedInputTokens: 0, cacheWriteTokens: inputTokens,
      outputTokens: task.maxOutputTokens });
    return support;
  } }), knowledgeProvider: { search() { throw new Error('DRY does not fetch documents.'); } } } : {}),
});
const scenarios = [
  { name: 'simple_session', weight: 0.9, turns: ['오늘 피곤해요', '마음이 좀 답답해요', '불안해요'] },
  { name: 'complex_support_session', weight: 0.1,
    turns: ['가족과 직장에서 동시에 갈등이 있어요', '하지만 관계를 포기하기도 어려워요', '반복되는 불안과 관계 문제를 상담하고 싶어요'] },
];
const results = [];
for (const scenario of scenarios) {
  let memory = '';
  const start = records.length;
  for (const [turnCount, userMessage] of scenario.turns.entries()) {
    // A synthetic trusted premium owner keeps quota fallback from faking cost savings.
    const result = await service({ session: { sessionId: scenario.name, selectedEmotion: '불안', emotionIntensity: 6,
      turnCount, conversationMemory: memory }, userMessage, systemPromptVersion: 'ko-v1', allowedVerseIds: [] },
    undefined, memory, { userId: `benchmark-${scenario.name}`, plan: 'premium' });
    responseSchema.parse(result);
    memory = result.memorySummary;
  }
  const events = records.slice(start);
  const summary = service.usageLedger.sessionSummary({ userId: `benchmark-${scenario.name}`, sessionId: scenario.name });
  results.push({ name: scenario.name, weight: scenario.weight, ...summary,
    fallbackRequests: events.filter(event => event.fallback).length,
    fallbackReasons: events.filter(event => event.fallback).map(event => event.fallbackReason),
    averageModelCallsPerMessage: summary.sessionModelCalls / scenario.turns.length });
}
const known = results.every(result => result.sessionEstimatedCostUsd !== null);
const weightedSessionUsd = known ? results.reduce((sum, item) => sum + item.weight * item.sessionEstimatedCostUsd, 0) : null;
console.log(JSON.stringify({ stage: real ? 'REAL' : 'DRY_CONSERVATIVE_SIMULATION',
  realCalls: real, sessionDefinition: '3 messages, then client-owned local verse/action/card flow',
  populationMeasured: false, assumedMix: '90% simple / 10% complex nonreligious support',
  priceModels: Object.keys(readPricing(env)), results, weightedSessionUsd,
  usdTarget: 0.007, simulatedTargetMet: weightedSessionUsd !== null && weightedSessionUsd < 0.007,
  realTargetVerified: false,
}, null, 2));
if (real && results.some(result => result.fallbackRequests || result.sessionEstimatedCostUsd === null || result.sessionModelCalls === 0)) process.exitCode = 1;
