import { assertProductionSource, corpusPolicy, validateCandidate } from './production_guard.js';
import { validateCitations } from '../agents/citation_validator.js';
import { reviewReligiousIntegrity } from '../agents/religious_integrity_agent.js';
import { assessSafety } from '../agents/safety_agent.js';

export const productionValidators = Object.freeze({ citation: validateCitations, integrity: reviewReligiousIntegrity, safety: assessSafety });
export function productionConfiguration(env = {}) {
  return Object.freeze({
    corpusMode: env.NODE_ENV === 'production' || env.SOUL_CORPUS_MODE === 'production' ? 'production' : 'development',
    externalApiDisabled: env.SOUL_EXTERNAL_API_DISABLED === 'true',
    multiAgentEnabled: env.SOUL_MULTI_AGENT_ENABLED === 'true',
    retrievalMode: env.SOUL_HYBRID_EXPERIMENTAL === 'true' ? 'hybrid' : 'keyword',
    productionDefault: 'keyword', hybridExperimental: env.SOUL_HYBRID_EXPERIMENTAL === 'true',
  });
}

export async function checkProductionReadiness({ index, traditions, validators = productionValidators }) {
  const failures = [];
  const activeIndexes = {};
  const add = (status, tradition) => failures.push({ status, ...(tradition ? { tradition } : {}) });
  if (['citation', 'integrity', 'safety'].some(key => typeof validators[key] !== 'function')) add('BLOCKED_VALIDATION');
  if (!Array.isArray(traditions) || !traditions.length || new Set(traditions).size !== traditions.length) add('BLOCKED_INDEX');
  for (const tradition of traditions ?? []) {
    try { corpusPolicy(tradition); } catch { add('BLOCKED_INDEX', tradition); continue; }
    if (!index) { add('BLOCKED_NO_APPROVED_CORPUS', tradition); continue; }
    // Inspect source problems before manifest verification to report a useful blocking reason.
    try {
      const state = await index.registry();
      if (!state.active[tradition]) {
        add(Object.values(state.indexes).some(entry => entry.tradition === tradition) ? 'BLOCKED_INDEX' : 'BLOCKED_NO_APPROVED_CORPUS', tradition);
        continue;
      }
      const raw = await index.inspectSnapshot(state.active[tradition]);
      const sourceFailures = checkCorpusReadiness(raw.records, tradition);
      if (sourceFailures.length) { failures.push(...sourceFailures); continue; }
      const active = await index.resolveActive(tradition);
      if (!active?.records?.length) { add('BLOCKED_NO_APPROVED_CORPUS', tradition); continue; }
      const corpusFailures = checkCorpusReadiness(active.records, tradition);
      failures.push(...corpusFailures);
      if (!corpusFailures.length) activeIndexes[tradition] = active.manifest;
    } catch { add('BLOCKED_INDEX', tradition); }
  }
  return { status: failures[0]?.status ?? 'READY', failures, activeIndexes,
    actualCorpusApproval: failures.some(row => row.status === 'BLOCKED_NO_APPROVED_CORPUS') ? 'BLOCKED_EXTERNAL_REVIEW' : 'NOT_ASSESSED',
    scope: traditions ?? [] };
}

export function checkCorpusReadiness(records, tradition) {
  if (!Array.isArray(records) || !records.length) return [{ status: 'BLOCKED_NO_APPROVED_CORPUS', tradition }];
  const failures = [];
  for (const record of records) {
    let status;
    if (record.tradition !== tradition) status = 'BLOCKED_INDEX';
    else if (!corpusPolicy(tradition).licenseRequirements.allowed.includes(record.metadata?.licenseStatus)) status = 'BLOCKED_LICENSE';
    else {
      try { validateCandidate(record); } catch { status = 'BLOCKED_PROVENANCE'; }
      if (!status) { try { assertProductionSource(record); } catch { status = 'BLOCKED_NO_APPROVED_CORPUS'; } }
    }
    if (status) failures.push({ status, tradition, sourceId: record.sourceId });
  }
  return failures;
}
