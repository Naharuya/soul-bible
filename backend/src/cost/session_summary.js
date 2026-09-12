export function sessionSummary(total = {}) {
  return {
    sessionModelCalls: total.modelCalls ?? 0,
    sessionInputTokens: total.inputTokens ?? 0,
    sessionCachedTokens: total.cachedInputTokens ?? 0,
    sessionOutputTokens: total.outputTokens ?? 0,
    sessionUnknownCostCalls: total.unknownCostCalls ?? 0,
    sessionEstimatedCostUsd: total.unknownCostCalls ? null : total.knownCostUsd ?? 0,
    sessionBudgetUsedUsd: total.budgetUsedUsd ?? 0,
  };
}
