import { taskTiers } from './model_router.js';

export function configuredNumber(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  // Invalid explicit policy fails closed, rather than silently raising a quota.
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function costPolicy(plan = 'free', env = process.env) {
  const premium = plan === 'premium';
  const prefix = premium ? 'SOUL_PREMIUM' : 'SOUL_FREE';
  const dailyCalls = Math.floor(configuredNumber(env, `${prefix}_DAILY_AI_CALLS`, premium ? 50 : 5));
  const dailyBudget = configuredNumber(env, `${prefix}_DAILY_AI_BUDGET_USD`, premium ? 0.30 : 0.03);
  return {
    dailyCalls, dailyBudget,
    monthlyCalls: Math.floor(configuredNumber(env, `${prefix}_MONTHLY_AI_CALLS`, dailyCalls * 31)),
    monthlyBudget: configuredNumber(env, `${prefix}_MONTHLY_AI_BUDGET_USD`, dailyBudget * 31),
    premiumCalls: Math.floor(configuredNumber(env, `${prefix}_PREMIUM_CALLS`, premium ? 50 : 0)),
    reservationUsd: configuredNumber(env, 'SOUL_AI_REQUEST_RESERVATION_USD', 0.006),
  };
}

export function evaluateCostGate({ plan = 'free', taskType = 'conversation', dailyUsage = {}, monthlyUsage = {}, globalUsage = {}, reservationUsd } = {}, env = process.env) {
  const policy = costPolicy(plan, env);
  if (Number.isFinite(reservationUsd) && reservationUsd > 0 && !env.SOUL_AI_REQUEST_RESERVATION_USD) policy.reservationUsd = reservationUsd;
  const remainingDailyBudget = Math.max(0, policy.dailyBudget - (dailyUsage.budgetUsedUsd ?? 0));
  const desired = taskTiers[taskType] ?? 'standard';
  const result = (tier, reason) => ({ allowed: tier !== 'blocked', tier, reason, remainingDailyBudget, policy });
  if (['crisis', 'self_harm', 'immediate_safety'].includes(taskType)) return result('local', 'safety_bypass');
  if (['local', 'rag'].includes(desired)) return result(desired, 'no_llm_required');
  if (policy.reservationUsd <= 0 || (dailyUsage.aiRequests ?? 0) >= policy.dailyCalls
    || (monthlyUsage.aiRequests ?? 0) >= policy.monthlyCalls
    || remainingDailyBudget + 1e-12 < policy.reservationUsd
    || policy.monthlyBudget - (monthlyUsage.budgetUsedUsd ?? 0) + 1e-12 < policy.reservationUsd) {
    return result('local', 'quota_exhausted');
  }
  const ratio = Math.max((dailyUsage.aiRequests ?? 0) / policy.dailyCalls,
    (dailyUsage.budgetUsedUsd ?? 0) / policy.dailyBudget,
    (monthlyUsage.aiRequests ?? 0) / policy.monthlyCalls,
    (monthlyUsage.budgetUsedUsd ?? 0) / policy.monthlyBudget);
  let tier = desired;
  if (tier === 'premium' && ((dailyUsage.premiumRequests ?? 0) >= policy.premiumCalls
    || ((globalUsage.premiumRequests ?? 0) + 1) / ((globalUsage.aiRequests ?? 0) + 1) > 0.05)) tier = 'standard';
  if (ratio >= 0.8) tier = 'cheap';
  else if (ratio >= 0.5 && tier === 'premium') tier = 'standard';
  return result(tier, tier === desired ? 'within_daily_budget' : 'budget_downgrade');
}
