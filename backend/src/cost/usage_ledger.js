import { createHmac, randomBytes } from 'node:crypto';
import { evaluateCostGate } from './cost_gate.js';
import { estimateCost, estimateCacheSavings } from './model_pricing.js';

const blank = () => ({ aiRequests: 0, premiumRequests: 0, premiumModelCalls: 0, budgetUsedUsd: 0, modelCalls: 0,
  inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, knownCostUsd: 0, unknownCostCalls: 0, estimatedCacheSavings: 0 });
const routingBlank = () => ({ local: 0, rag: 0, cheap: 0, standard: 0, premium: 0 });
const safeLabel = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value) && !/^sk-/i.test(value) ? value : 'configured';

export function createUsageLedger({ env = {}, pricing = {}, now = () => new Date(), maxEntries = 10000, maxOwners = 10000 } = {}) {
  const salt = randomBytes(32);
  const hash = value => createHmac('sha256', salt).update(String(value)).digest('hex');
  const days = new Map(); const months = new Map(); const events = [];
  function period(map, key) {
    if (!map.has(key)) map.set(key, { total: blank(), owners: new Map(), routing: routingBlank(), sessions: new Set(), users: new Set() });
    return map.get(key);
  }
  function current() {
    const timestamp = now().toISOString(); const day = timestamp.slice(0, 10); const month = timestamp.slice(0, 7);
    // Calendar windows are UTC. Never evict a current owner's quota to make room.
    for (const key of days.keys()) if (key < day) days.delete(key);
    for (const key of months.keys()) if (key < month) months.delete(key);
    return { timestamp, day: period(days, day), month: period(months, month) };
  }
  function owner(period, key) {
    if (!period.owners.has(key)) {
      if (period.owners.size >= maxOwners) throw new Error('Cost ledger capacity reached.');
      period.owners.set(key, blank());
    }
    return period.owners.get(key);
  }
  function add(targets, key, value) { for (const target of targets) target[key] += value; }
  function push(event) { events.push(event); if (events.length > maxEntries) events.shift(); }
  function reserve({ userId = null, sessionId = '', plan = 'free', taskType = 'conversation', agent = 'integrated' } = {}) {
    const window = current();
    const authenticated = typeof userId === 'string' && userId.length > 0;
    const id = authenticated ? hash(userId) : 'anonymous';
    const effectivePlan = authenticated && plan === 'premium' ? 'premium' : 'free';
    const daily = owner(window.day, id); const monthly = owner(window.month, id);
    const decision = evaluateCostGate({ plan: effectivePlan, taskType, dailyUsage: daily, monthlyUsage: monthly, globalUsage: window.day.total }, env);
    const paid = ['cheap', 'standard', 'premium'].includes(decision.tier);
    const targets = [daily, monthly, window.day.total, window.month.total];
    if (paid) {
      add(targets, 'aiRequests', 1);
      add(targets, 'budgetUsedUsd', decision.policy.reservationUsd);
      if (decision.tier === 'premium') add(targets, 'premiumRequests', 1);
    }
    const metadata = { timestamp: window.timestamp, userId: authenticated ? id : null,
      sessionId: hash(`${id}:${sessionId}`), plan: effectivePlan, taskType: safeLabel(taskType), agent: safeLabel(agent) };
    const calls = []; let finished = false;
    return {
      decision,
      capModelTier(tier) {
        return tier === 'premium' && (window.day.total.premiumModelCalls + 1) / (window.day.total.modelCalls + 1) > 0.05 ? 'standard' : tier;
      },
      recordCall({ model, modelTier }) {
        if (!paid || finished || calls.length >= 4) throw new Error('Cost call limit.');
        const entry = { ...metadata, model: safeLabel(model), modelTier: safeLabel(modelTier), modelCalls: 1,
          inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedCostUsd: null,
          provider: 'openai', fallback: false, fallbackReason: null };
        calls.push(entry); push(entry);
        add(targets, 'modelCalls', 1); add(targets, 'unknownCostCalls', 1);
        if (modelTier === 'premium') add(targets, 'premiumModelCalls', 1);
        let reported = false;
        return counts => {
          if (reported || ![counts?.inputTokens, counts?.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)) return;
          reported = true;
          entry.inputTokens = counts.inputTokens; entry.outputTokens = counts.outputTokens;
          entry.cachedInputTokens = Number.isSafeInteger(counts.cachedInputTokens) && counts.cachedInputTokens >= 0
            ? Math.min(counts.cachedInputTokens, counts.inputTokens) : 0;
          for (const key of ['inputTokens', 'cachedInputTokens', 'outputTokens']) add(targets, key, entry[key]);
          entry.estimatedCostUsd = estimateCost({ ...entry, model }, pricing);
          if (entry.estimatedCostUsd !== null) {
            add(targets, 'unknownCostCalls', -1); add(targets, 'knownCostUsd', entry.estimatedCostUsd);
            add(targets, 'estimatedCacheSavings', estimateCacheSavings({ ...entry, model }, pricing));
          }
          // Late usage after timeout remains visible, while its conservative
          // reservation is retained. It cannot restart a completed request.
        };
      },
      finish({ tier = decision.tier, provider = 'local', fallback = false, fallbackReason = null } = {}) {
        if (finished) return;
        finished = true;
        const finalTier = Object.hasOwn(window.day.routing, tier) ? tier : 'local';
        window.day.routing[finalTier]++; window.month.routing[finalTier]++;
        if (calls.length) {
          if (window.day.sessions.size < maxEntries) window.day.sessions.add(metadata.sessionId);
          if (authenticated && window.day.users.size < maxOwners) window.day.users.add(id);
        }
        for (const entry of calls) Object.assign(entry, { fallback: Boolean(fallback), fallbackReason: fallbackReason ? safeLabel(fallbackReason) : null });
        if (!calls.length) push({ ...metadata, model: null, modelTier: finalTier, modelCalls: 0,
          inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedCostUsd: 0,
          provider: safeLabel(provider), fallback: Boolean(fallback), fallbackReason: fallbackReason ? safeLabel(fallbackReason) : null });
        if (paid) {
          if (!calls.length) {
            add(targets, 'aiRequests', -1);
            if (decision.tier === 'premium') add(targets, 'premiumRequests', -1);
          }
          const known = calls.every(call => call.estimatedCostUsd !== null);
          const settled = known ? calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0) : decision.policy.reservationUsd;
          add(targets, 'budgetUsedUsd', settled - decision.policy.reservationUsd);
        }
      },
    };
  }
  return {
    reserve,
    entries: () => structuredClone(events),
    overview() {
      const { day } = current(); const total = day.total;
      const estimatedCostUsd = total.unknownCostCalls ? null : total.knownCostUsd;
      const members = [...day.owners].filter(([id]) => id !== 'anonymous').map(([, usage]) => usage);
      const memberCost = members.some(usage => usage.unknownCostCalls) ? null : members.reduce((sum, usage) => sum + usage.knownCostUsd, 0);
      return { available: true, timezone: 'UTC', scope: 'process', today: { ...total, estimatedCostUsd },
        routing: { ...day.routing }, cacheHitRate: total.inputTokens ? total.cachedInputTokens / total.inputTokens : 0,
        cachedInputTokens: total.cachedInputTokens,
        estimatedCacheSavings: total.unknownCostCalls ? null : total.estimatedCacheSavings,
        averageCostPerAiSession: estimatedCostUsd !== null && day.sessions.size ? estimatedCostUsd / day.sessions.size : null,
        averageCostPerMember: memberCost !== null && day.users.size ? memberCost / day.users.size : null };
    },
  };
}
