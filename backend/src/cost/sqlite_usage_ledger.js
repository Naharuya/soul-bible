import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { evaluateCostGate } from './cost_gate.js';
import { estimateCost, estimateCacheSavings } from './model_pricing.js';

const applicationId = 0x53424347; // SBCG: never migrate an unrelated SQLite DB.
const tiers = ['local', 'rag', 'cheap', 'standard', 'premium'];
const paidTiers = ['cheap', 'standard', 'premium'];
const label = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value) && !/^sk-/i.test(value) ? value : 'configured';
function ledgerError(code = 'COST_LEDGER') {
  const error = new Error('AI usage accounting is unavailable.'); error.code = code; return error;
}

export function createSqliteUsageLedger({ filename, env = {}, pricing = {}, now = () => new Date(),
  timeoutMs = 250, reservationTtlMs = 60_000, retentionDays = 62, maxOwners = 10000, maxEntries = 10000 } = {}) {
  if (!filename || !Number.isSafeInteger(reservationTtlMs) || reservationTtlMs < 60_000
    || !Number.isSafeInteger(retentionDays) || retentionDays < 32 || retentionDays > 366
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 5000
    || !Number.isSafeInteger(maxOwners) || maxOwners < 1
    || !Number.isSafeInteger(maxEntries) || maxEntries < 1) throw ledgerError();
  if (filename !== ':memory:') {
    filename = path.resolve(filename);
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    try { fs.closeSync(fs.openSync(filename, 'ax', 0o600)); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (!fs.lstatSync(filename).isFile()) throw ledgerError();
    if (process.platform !== 'win32') fs.chmodSync(filename, 0o600);
  }
  const db = new Database(filename, { timeout: timeoutMs });
  let salt;
  try {
    db.pragma('foreign_keys = ON');
    db.transaction(() => {
      const id = db.pragma('application_id', { simple: true });
      if (id !== applicationId && (id !== 0 || db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1").get())) throw ledgerError();
      db.pragma(`application_id = ${applicationId}`);
      db.exec(`
        CREATE TABLE IF NOT EXISTS cost_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cost_requests (
          id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, day TEXT NOT NULL, month TEXT NOT NULL,
          owner_id TEXT NOT NULL, session_id TEXT NOT NULL, plan TEXT NOT NULL, agent TEXT NOT NULL, task_type TEXT NOT NULL,
          tier TEXT NOT NULL, reserved_usd REAL NOT NULL, budget_usd REAL NOT NULL,
          ai_count INTEGER NOT NULL, premium_request INTEGER NOT NULL,
          state TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL,
          final_tier TEXT, provider TEXT, fallback INTEGER NOT NULL DEFAULT 0, fallback_reason TEXT
        );
        CREATE INDEX IF NOT EXISTS cost_requests_day ON cost_requests(day, owner_id);
        CREATE INDEX IF NOT EXISTS cost_requests_month ON cost_requests(month, owner_id);
        CREATE INDEX IF NOT EXISTS cost_requests_timestamp ON cost_requests(timestamp);
        CREATE INDEX IF NOT EXISTS cost_requests_paid_day ON cost_requests(day, owner_id) WHERE ai_count = 1 OR budget_usd > 0;
        CREATE INDEX IF NOT EXISTS cost_requests_paid_month ON cost_requests(month, owner_id) WHERE ai_count = 1 OR budget_usd > 0;
        CREATE INDEX IF NOT EXISTS cost_requests_expiry ON cost_requests(state, expires_at);
        CREATE TABLE IF NOT EXISTS cost_calls (
          id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES cost_requests(id) ON DELETE CASCADE,
          model TEXT NOT NULL, model_tier TEXT NOT NULL, price_json TEXT,
          usage_reported INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0, cached_input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL, savings_usd REAL
        );
        CREATE INDEX IF NOT EXISTS cost_calls_request ON cost_calls(request_id);
      `);
      db.prepare("INSERT OR IGNORE INTO cost_meta VALUES ('version', '1')").run();
      if (db.prepare("SELECT value FROM cost_meta WHERE key = 'version'").get().value !== '1') throw ledgerError();
      db.prepare("INSERT OR IGNORE INTO cost_meta VALUES ('salt', ?)").run(randomBytes(32).toString('hex'));
      salt = db.prepare("SELECT value FROM cost_meta WHERE key = 'salt'").get().value;
      if (!/^[a-f0-9]{64}$/.test(salt)) throw ledgerError();
    }).immediate();
    const mode = db.pragma('journal_mode = WAL', { simple: true });
    if (filename !== ':memory:' && mode !== 'wal') throw ledgerError();
    db.pragma('synchronous = FULL');
  } catch (error) { db.close(); throw error; }
  const hash = value => createHmac('sha256', Buffer.from(salt, 'hex')).update(String(value)).digest('hex');
  const atomic = fn => (...args) => db.transaction(fn).immediate(...args);
  const getRequest = db.prepare('SELECT * FROM cost_requests WHERE id = ?');
  const getCall = db.prepare('SELECT * FROM cost_calls WHERE id = ?');
  const callSummary = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(cost_usd), 0) AS known,
    COALESCE(SUM(cost_usd IS NULL), 0) AS unknown FROM cost_calls WHERE request_id = ?`);
  const settle = request => {
    const counts = callSummary.get(request.id);
    // An orphaned call may already have reached the provider. Missing usage is
    // never evidence that it was free; retain at least the original reservation.
    const cost = counts.unknown ? Math.max(request.reserved_usd, counts.known) : counts.known;
    db.prepare('UPDATE cost_requests SET budget_usd = ?, ai_count = ?, premium_request = ? WHERE id = ?')
      .run(cost, counts.count ? 1 : 0, counts.count ? request.premium_request : 0, request.id);
  };
  let lastPrunedDay;
  function recoverAt(timestamp) {
    for (const request of db.prepare("SELECT * FROM cost_requests WHERE state = 'pending' AND expires_at <= ?").all(timestamp)) {
      db.prepare("UPDATE cost_requests SET state = 'abandoned', final_tier = 'local', provider = 'local', fallback = 1, fallback_reason = 'reservation_expired' WHERE id = ?").run(request.id);
      settle(request);
    }
    if (lastPrunedDay !== timestamp.slice(0, 10)) {
      const cutoff = new Date(Date.parse(timestamp) - retentionDays * 86_400_000).toISOString();
      db.prepare("DELETE FROM cost_requests WHERE timestamp < ? AND state != 'pending'").run(cutoff);
      // Do not cache this until a successful commit (callers set it outside).
    }
  }
  function windowUsage(column, value, ownerId) {
    // column is exclusively one of the internal literals 'day' or 'month'.
    return db.prepare(`SELECT COALESCE(SUM(ai_count),0) AS aiRequests,
      COALESCE(SUM(premium_request),0) AS premiumRequests, COALESCE(SUM(budget_usd),0) AS budgetUsedUsd
      FROM cost_requests WHERE ${column} = ? AND (ai_count = 1 OR budget_usd > 0) ${ownerId === undefined ? '' : 'AND owner_id = ?'}`)
      .get(...(ownerId === undefined ? [value] : [value, ownerId]));
  }
  function premiumAllowed(day) {
    const counts = db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(c.model_tier = 'premium'),0) AS premium
      FROM cost_calls c JOIN cost_requests r ON r.id = c.request_id WHERE r.day = ?`).get(day);
    return (counts.premium + 1) / (counts.calls + 1) <= 0.05;
  }
  function timestampNow() { return now().toISOString(); }
  const begin = atomic(input => {
    const timestamp = timestampNow(); recoverAt(timestamp);
    const day = timestamp.slice(0, 10); const month = timestamp.slice(0, 7);
    const authenticated = typeof input.userId === 'string' && input.userId.length > 0;
    const ownerId = authenticated ? hash(input.userId) : 'anonymous';
    const plan = authenticated && input.plan === 'premium' ? 'premium' : 'free';
    if (!db.prepare('SELECT 1 FROM cost_requests WHERE month = ? AND owner_id = ? LIMIT 1').get(month, ownerId)
      && db.prepare('SELECT COUNT(DISTINCT owner_id) AS count FROM cost_requests WHERE month = ?').get(month).count >= maxOwners) throw ledgerError();
    const decision = evaluateCostGate({ plan, taskType: input.taskType ?? 'conversation',
      dailyUsage: windowUsage('day', day, ownerId), monthlyUsage: windowUsage('month', month, ownerId),
      globalUsage: windowUsage('day', day) }, env);
    const paid = paidTiers.includes(decision.tier);
    const id = randomUUID();
    db.prepare(`INSERT INTO cost_requests (id, timestamp, day, month, owner_id, session_id, plan, agent, task_type,
      tier, reserved_usd, budget_usd, ai_count, premium_request, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, timestamp, day, month, ownerId, hash(`${ownerId}:${input.sessionId ?? ''}`), plan, label(input.agent ?? 'integrated'),
        label(input.taskType ?? 'conversation'), decision.tier, paid ? decision.policy.reservationUsd : 0,
        paid ? decision.policy.reservationUsd : 0, paid ? 1 : 0, paid && decision.tier === 'premium' ? 1 : 0,
        new Date(Date.parse(timestamp) + reservationTtlMs).toISOString());
    return { id, decision, day };
  });
  const startCall = atomic((requestId, { model, modelTier }) => {
    const timestamp = timestampNow(); recoverAt(timestamp);
    const request = getRequest.get(requestId);
    if (!request || request.state !== 'pending' || !request.ai_count || !paidTiers.includes(modelTier)
      || tiers.indexOf(modelTier) > tiers.indexOf(request.tier) || callSummary.get(requestId).count >= 4) throw ledgerError();
    // Unlike the advisory capModelTier read, this check and insertion hold the
    // same SQLite write lock, including across independent Node processes.
    if (modelTier === 'premium' && !premiumAllowed(request.day)) throw ledgerError('COST_PREMIUM_SHARE');
    const id = randomUUID();
    const price = estimateCost({ model }, pricing) === null ? null : pricing[model];
    db.prepare('INSERT INTO cost_calls (id, request_id, model, model_tier, price_json) VALUES (?, ?, ?, ?, ?)')
      .run(id, requestId, label(model), modelTier, price ? JSON.stringify({ input: price.input, cachedInput: price.cachedInput, output: price.output }) : null);
    return id;
  });
  const track = atomic((callId, counts) => {
    const call = getCall.get(callId);
    if (!call || call.usage_reported || ![counts?.inputTokens, counts?.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0)) return;
    const cachedInputTokens = Number.isSafeInteger(counts.cachedInputTokens) && counts.cachedInputTokens >= 0 ? Math.min(counts.cachedInputTokens, counts.inputTokens) : 0;
    const usage = { model: call.model, inputTokens: counts.inputTokens, cachedInputTokens, outputTokens: counts.outputTokens };
    const savedPrice = call.price_json ? { [call.model]: JSON.parse(call.price_json) } : {};
    db.prepare(`UPDATE cost_calls SET usage_reported = 1, input_tokens = ?, cached_input_tokens = ?, output_tokens = ?, cost_usd = ?, savings_usd = ? WHERE id = ?`)
      .run(usage.inputTokens, cachedInputTokens, usage.outputTokens, estimateCost(usage, savedPrice), estimateCacheSavings(usage, savedPrice), callId);
    const request = getRequest.get(call.request_id);
    // Reconcile late usage idempotently, including after expiry or normal finish.
    if (request.state !== 'pending') settle(request);
  });
  const finish = atomic((requestId, result) => {
    const request = getRequest.get(requestId);
    if (!request || request.state !== 'pending') return;
    const tier = tiers.includes(result.tier ?? request.tier) ? result.tier ?? request.tier : 'local';
    db.prepare(`UPDATE cost_requests SET state = 'finished', final_tier = ?, provider = ?, fallback = ?, fallback_reason = ? WHERE id = ?`)
      .run(tier, label(result.provider ?? 'local'), result.fallback ? 1 : 0, result.fallbackReason ? label(result.fallbackReason) : null, requestId);
    settle(request);
  });
  function reserve(input = {}) {
    const lease = begin(input);
    lastPrunedDay = lease.day;
    return {
      decision: lease.decision,
      capModelTier: tier => tier === 'premium' && !premiumAllowed(lease.day) ? 'standard' : tier,
      recordCall(options) { const callId = startCall(lease.id, options); return counts => track(callId, counts); },
      finish: (result = {}) => finish(lease.id, result),
    };
  }
  const overview = atomic(() => {
    const timestamp = timestampNow(); recoverAt(timestamp); const day = timestamp.slice(0, 10);
    const totals = db.prepare(`SELECT COUNT(*) AS modelCalls, COALESCE(SUM(c.model_tier = 'premium'),0) AS premiumModelCalls,
      COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(cached_input_tokens),0) AS cachedInputTokens,
      COALESCE(SUM(output_tokens),0) AS outputTokens, COALESCE(SUM(cost_usd),0) AS knownCostUsd,
      COALESCE(SUM(cost_usd IS NULL),0) AS unknownCostCalls, COALESCE(SUM(savings_usd),0) AS estimatedCacheSavings
      FROM cost_calls c JOIN cost_requests r ON r.id = c.request_id WHERE r.day = ?`).get(day);
    const estimatedCostUsd = totals.unknownCostCalls ? null : totals.knownCostUsd;
    const routing = Object.fromEntries(tiers.map(tier => [tier, 0]));
    for (const row of db.prepare("SELECT final_tier, COUNT(*) AS count FROM cost_requests WHERE day = ? AND state != 'pending' GROUP BY final_tier").all(day)) {
      if (Object.hasOwn(routing, row.final_tier)) routing[row.final_tier] = row.count;
    }
    const averages = db.prepare(`SELECT COUNT(DISTINCT r.session_id) AS sessions,
      COUNT(DISTINCT CASE WHEN owner_id != 'anonymous' THEN owner_id END) AS members,
      COALESCE(SUM(CASE WHEN owner_id != 'anonymous' THEN cost_usd ELSE 0 END),0) AS memberCost,
      COALESCE(SUM(owner_id != 'anonymous' AND cost_usd IS NULL),0) AS memberUnknown
      FROM cost_calls c JOIN cost_requests r ON r.id = c.request_id WHERE r.day = ?`).get(day);
    const status = db.prepare(`SELECT COALESCE(SUM(state = 'pending' AND ai_count = 1),0) AS pendingReservations,
      COALESCE(SUM(state = 'abandoned'),0) AS recoveredReservations FROM cost_requests WHERE day = ?`).get(day);
    return { available: true, timezone: 'UTC', scope: 'sqlite', persistent: filename !== ':memory:', retentionDays,
      today: { ...windowUsage('day', day), ...totals, estimatedCostUsd, ...status }, routing,
      cacheHitRate: totals.inputTokens ? totals.cachedInputTokens / totals.inputTokens : 0,
      cachedInputTokens: totals.cachedInputTokens, estimatedCacheSavings: totals.unknownCostCalls ? null : totals.estimatedCacheSavings,
      averageCostPerAiSession: estimatedCostUsd !== null && averages.sessions ? estimatedCostUsd / averages.sessions : null,
      averageCostPerMember: !averages.memberUnknown && averages.members ? averages.memberCost / averages.members : null };
  });
  const entries = () => db.prepare(`SELECT r.timestamp, CASE WHEN r.owner_id = 'anonymous' THEN NULL ELSE r.owner_id END AS userId,
    r.session_id AS sessionId, r.plan, r.agent, r.task_type AS taskType, c.model,
    COALESCE(c.model_tier,r.final_tier) AS modelTier, CASE WHEN c.id IS NULL THEN 0 ELSE 1 END AS modelCalls,
    COALESCE(c.input_tokens,0) AS inputTokens, COALESCE(c.cached_input_tokens,0) AS cachedInputTokens,
    COALESCE(c.output_tokens,0) AS outputTokens, CASE WHEN c.id IS NULL THEN 0 ELSE c.cost_usd END AS estimatedCostUsd,
    CASE WHEN c.id IS NULL THEN r.provider ELSE 'openai' END AS provider,
    r.fallback, r.fallback_reason AS fallbackReason
    FROM cost_requests r LEFT JOIN cost_calls c ON c.request_id = r.id
    WHERE c.id IS NOT NULL OR r.state != 'pending' ORDER BY r.timestamp DESC, r.id, c.id LIMIT ?`).all(maxEntries)
    .map(entry => ({ ...entry, fallback: Boolean(entry.fallback) }));
  try { atomic(() => recoverAt(timestampNow()))(); } catch (error) { db.close(); throw error; }
  return { reserve, overview, entries, close() { if (db.open) db.close(); } };
}
