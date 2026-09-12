// Operational counters only. Never retain conversation text or identity.
export function createWebMetrics() {
  const startedAt = new Date().toISOString();
  const safety = new Map();
  const traditions = new Map();
  let completed = 0;
  let fallbacks = 0;
  return {
    safety(assessment) {
      if (!(assessment.level > 0)) return;
      const category = ['medical', 'violence', 'self_harm', 'passive_self_harm', 'psychosis', 'session_crisis', 'response_crisis'].includes(assessment.kind) ? assessment.kind : 'unknown';
      const riskLevel = Math.min(3, Math.max(1, Number(assessment.level)));
      const key = `${category}:${riskLevel}`;
      const row = safety.get(key) || { riskLevel, crisisTriggered: true, category, count: 0 };
      row.count++; row.timestamp = new Date().toISOString(); safety.set(key, row);
    },
    conversation(agent) {
      // Religion choice is an aggregate, never tied to a member or session.
      const key = ['protestant', 'catholic', 'buddhist', 'jewish', 'islamic', 'hindu', 'confucian'].includes(agent) ? agent : 'other';
      traditions.set(key, (traditions.get(key) || 0) + 1);
    },
    result(event) { completed++; if (event.fallback) fallbacks++; if (event.routedTradition) this.conversation(event.routedTradition); },
    overview() { return { scope: 'process', startedAt, safety: [...safety.values()], traditions: Object.fromEntries(traditions),
      completed, fallbacks, fallbackRate: completed ? fallbacks / completed : null,
      todayActiveUsers: null, retentionD1: null, retentionD7: null }; },
  };
}

// Ledger entries may be bounded. Explicitly label this as a recent sample,
// rather than confusing it with the ledger's complete UTC daily totals.
export function modelUsageSample(ledger) {
  if (!ledger?.entries) return { available: false, rows: [] };
  const entries = ledger.entries();
  const rows = new Map();
  const sessions = new Map();
  for (const entry of entries) {
    if (!entry.modelCalls) continue;
    // Hashes stay inside this adapter. This is observed cost, not a completed
    // session benchmark: the bounded ledger can omit older calls.
    const sessionKey = entry.sessionId ? `${entry.userId ?? ''}:${entry.sessionId}` : null;
    if (sessionKey) {
      const previous = sessions.get(sessionKey) ?? { cost: 0 };
      previous.cost = previous.cost === null || !Number.isFinite(entry.estimatedCostUsd)
        ? null : previous.cost + entry.estimatedCostUsd;
      sessions.set(sessionKey, previous);
    }
    const tier = ({ cheap: 'Luna', standard: 'Terra', premium: 'Sol' })[entry.modelTier] || entry.modelTier;
    const key = `${entry.model}:${tier}`;
    const row = rows.get(key) || { model: entry.model, tier, modelCalls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, fallback: 0 };
    for (const field of ['modelCalls', 'inputTokens', 'cachedInputTokens', 'outputTokens']) row[field] += entry[field] || 0;
    row.estimatedCostUsd = row.estimatedCostUsd === null || entry.estimatedCostUsd == null ? null : row.estimatedCostUsd + entry.estimatedCostUsd;
    if (entry.fallback) row.fallback += entry.modelCalls;
    rows.set(key, row);
  }
  const costs = [...sessions.values()].map(row => row.cost);
  const unknownSessions = costs.filter(cost => cost === null).length;
  const sorted = costs.filter(cost => cost !== null).sort((a, b) => a - b);
  const percentile = fraction => sorted.length && !unknownSessions ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
  return { available: true, scope: 'recent_sample', entryCount: entries.length, rows: [...rows.values()],
    sessionCosts: { scope: 'observed_sample', sessionCount: costs.length, unknownSessions,
      p50CostUsd: percentile(0.5), p90CostUsd: percentile(0.9) } };
}
