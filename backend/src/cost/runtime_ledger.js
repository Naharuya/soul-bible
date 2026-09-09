import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteUsageLedger } from './sqlite_usage_ledger.js';
import { createUsageLedger } from './usage_ledger.js';
import { readPricing } from './model_pricing.js';

export function createRuntimeUsageLedger({ env = process.env, logger = console } = {}) {
  try {
    const options = { env, pricing: readPricing(env) };
    if (env.SOUL_USAGE_LEDGER === 'memory') return createUsageLedger(options);
    if (env.SOUL_USAGE_LEDGER && env.SOUL_USAGE_LEDGER !== 'sqlite') throw new Error('Unknown ledger backend.');
    const filename = path.resolve(env.SOUL_USAGE_DB_PATH?.trim() || path.join('data', 'ai_usage.sqlite'));
    const publicDirectory = fileURLToPath(new URL('../../public/', import.meta.url));
    const relative = path.relative(publicDirectory, filename);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Private ledger path required.');
    return createSqliteUsageLedger({ ...options, filename,
      retentionDays: Number(env.SOUL_USAGE_RETENTION_DAYS ?? 62),
      timeoutMs: Number(env.SOUL_USAGE_DB_TIMEOUT_MS ?? 250) });
  } catch {
    try { logger.error?.('cost_ledger_unavailable'); } catch { /* No error text or filesystem paths in logs. */ }
    // Never silently fall back to a fresh, empty quota after persistent storage
    // fails. Existing service catches this and preserves local/safety responses.
    return { reserve() { const error = new Error('AI usage accounting is unavailable.'); error.code = 'COST_LEDGER'; throw error; },
      overview: () => ({ available: false, scope: 'sqlite', persistent: true }), entries: () => [], close() {} };
  }
}
