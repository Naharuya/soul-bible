export const taskTiers = Object.freeze({
  crisis: 'local', self_harm: 'local', immediate_safety: 'local', rule: 'local', greeting: 'local',
  bible_search: 'rag', religion_search: 'rag', emotion: 'cheap', intent: 'cheap',
  memory_summary: 'cheap', empathy: 'cheap', conversation: 'standard', integrated: 'standard',
  complex_faith: 'premium', complex: 'premium',
  simple_support: 'cheap', simple_faith: 'cheap', followup: 'cheap',
});
const tiers = ['local', 'rag', 'cheap', 'standard', 'premium'];

// Server-side rules only. Client-provided plan/task/complexity fields are ignored.
export function classifyTask(body, { v1 = false } = {}) {
  const text = body.userMessage.trim();
  if (/^(안녕(?:하세요)?|고마워(?:요)?|감사합니다|네|응|괜찮아요)[.!?\s]*$/.test(text)) return 'greeting';
  if (/(찾아|검색|구절|자료)/.test(text) && !/(설명|해석|비교|논증)/.test(text)) {
    if (/(성경|말씀|시편|복음|구절)/.test(text)) return 'bible_search';
    if (/(불교|가톨릭|천주교|이슬람|유교|종교)/.test(text)) return 'religion_search';
  }
  if (text.length > 160 && /(비교|모순|신정론|교리|논증)/.test(text)) return 'complex_faith';
  if (/^(위로|공감)(해\s?줘|해\s?주세요|가 필요해요)[.!?\s]*$/.test(text)) return 'empathy';
  if (v1) {
    if (['action', 'summary', 'ended'].includes(body.session?.currentStage)
      && /^(저장|마음\s?카드|마치기|종료|건너뛰기)[.!?\s]*$/u.test(text)) return 'rule';
    if (/(?:시편|잠언|요한|마태|마가|누가|로마|창세|출애굽|빌립보|[A-Za-z]+)\S*\s*\d+\s*[:장편]\s*\d+/u.test(text)
      && !/(설명|해석|비교|왜)/u.test(text)) return 'bible_search';
    if (/(신정론|삼위일체|예정론|자유의지|교리.{0,15}(모순|논증)|고난.{0,15}(하나님|철학)|철학.{0,15}고난)/u.test(text)) return 'complex_faith';
    if (/(비교|논증|다중|상충|모순)/u.test(text)) return 'complex';
    if (/(부족|피상적|너무 일반적|다시.{0,8}깊이)/u.test(text)) return 'quality_retry';
    if (/(요약|정리해)/u.test(text) && text.length < 160) return 'memory_summary';
    if (/(성경|신앙|(?<![가-힣])기도|종교|교리|불교|가톨릭|이슬람|예수|부처|꾸란|토라|힌두|유교|중도|사성제|팔정도|성사|묵주|논어|자비|구원)/u.test(text)) {
      return text.length < 70 && !/(해석|설명|의미|왜)/u.test(text) ? 'simple_faith' : 'integrated';
    }
    if (text.length > 160 || /(트라우마|반복.{0,10}(관계|불안)|상담|갈등|동시에|하지만|한편|복합)/u.test(text)) return 'integrated';
    return (body.session?.turnCount ?? 0) > 0 ? 'followup' : 'simple_support';
  }
  return 'conversation';
}

export const costRouterEnabled = env => env.SOUL_COST_ROUTER_V1_ENABLED !== 'false';
export const costTierNames = Object.freeze({ cheap: 'luna', standard: 'terra', premium: 'sol', local: 'local', rag: 'rag' });
export const outputLimits = Object.freeze({ luna: 220, terra: 360, sol: 600, local: 0, rag: 0 });
export function modelForCostTier(ledgerTier, env = {}) {
  const tier = costTierNames[ledgerTier];
  return ['local', 'rag'].includes(tier) ? null :
    env[`OPENAI_${tier.toUpperCase()}_MODEL`]?.trim() || env[`OPENAI_${ledgerTier.toUpperCase()}_MODEL`]?.trim() || `gpt-5.6-${tier}`;
}
const reasons = { greeting: 'local_template', rule: 'local_template', bible_search: 'rag_answer', religion_search: 'rag_answer',
  simple_support: 'simple_emotion', empathy: 'simple_emotion', followup: 'simple_followup', memory_summary: 'summary',
  simple_faith: 'rag_answer', integrated: 'integrated_support', complex_faith: 'complex_religious_question',
  complex: 'complex_reasoning', quality_retry: 'escalation_quality' };

// Public plan/complexity fields never participate. The gate still owns quotas.
export function routeCostRequest(body, env = {}) {
  const taskType = classifyTask(body, { v1: true });
  const ledgerTier = taskType === 'quality_retry' ? 'standard' : taskTiers[taskType] ?? 'standard';
  const tier = costTierNames[ledgerTier];
  const model = modelForCostTier(ledgerTier, env);
  return { taskType, complexity: tier === 'sol' ? 'high' : tier === 'terra' ? 'medium' : 'low',
    tier, ledgerTier, model, reason: reasons[taskType] ?? 'integrated_support', maxOutputTokens: outputLimits[tier],
    // A soft target is not permission to replace complex reasoning with weak output.
    minimumTier: taskType === 'complex' && body.userMessage.length < 240 && !/(논증|모순|다중)/u.test(body.userMessage) ? 'standard' : ledgerTier,
    specialist: ['simple_faith', 'integrated', 'complex_faith', 'complex'].includes(taskType)
      && /(성경|신앙|(?<![가-힣])기도|종교|교리|불교|가톨릭|이슬람|예수|부처|꾸란|토라|힌두|유교|신정론|삼위일체|예정론|중도|사성제|팔정도|성사|묵주|논어|자비|구원)/u.test(body.userMessage),
  };
}

export function applySessionTarget(route, session, env = {}) {
  const value = Number(env.SOUL_TARGET_SESSION_COST_USD ?? 0.007);
  const target = Number.isFinite(value) && value > 0 ? value : 0.007;
  const spent = session?.sessionEstimatedCostUsd;
  const projected = { luna: 0.0008, terra: 0.008, sol: 0.02 }[route.tier] ?? 0;
  const pressure = spent === null || (session?.sessionBudgetUsedUsd ?? spent ?? 0) + projected > target;
  // General multi-context reasoning can use Terra; doctrinal high-complexity
  // requests retain Sol's quality floor. Hard member/global quotas remain separate.
  if (pressure && route.tier === 'sol' && route.minimumTier === 'standard') {
    return { ...route, ledgerTier: 'standard', tier: 'terra', model: modelForCostTier('standard', env),
      maxOutputTokens: outputLimits.terra, gateTaskType: 'integrated', targetAction: 'quality_eligible_lower_tier', targetSessionCostUsd: target };
  }
  return { ...route, targetAction: pressure ? 'quality_floor_retained' : 'within_target', targetSessionCostUsd: target };
}

export function routeModel({ taskType = 'conversation', costTier = 'standard' } = {}, env = process.env) {
  if (costTier === 'blocked' || !tiers.includes(costTier)) return { tier: 'local', model: null };
  const desired = taskTiers[taskType] ?? 'standard';
  const tier = tiers[Math.min(tiers.indexOf(desired), tiers.indexOf(costTier))];
  if (tier === 'local' || tier === 'rag') return { tier, model: null };
  return { tier, model: env[`OPENAI_${tier.toUpperCase()}_MODEL`]?.trim() || env.OPENAI_MODEL?.trim() || 'gpt-5.6' };
}
