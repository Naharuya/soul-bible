import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { knowledgeRecordSchema, searchSchema, searchResultSchema, knowledgeError } from './contracts.js';
import { createHybridRetriever } from './hybrid_retriever.js';
import { knowledgeNamespaces } from './namespaces.js';
import { requireProductionLicense } from './source_quality.js';
import { productionEligible } from './production_guard.js';
import { keywordRetriever } from './retriever.js';
import { inferTraditionBranch } from './query_normalization.js';

export { knowledgeNamespaces } from './namespaces.js';

// Storage sees exactly one validated namespace; agents never read files.
export const jsonKnowledgeStore = Object.freeze({
  async load(namespace, { signal } = {}) {
    if (!Object.values(knowledgeNamespaces).includes(namespace)) throw knowledgeError();
    return JSON.parse(await readFile(new URL(`./${namespace}/samples.json`, import.meta.url), { encoding: 'utf8', signal }));
  },
});

export function createReligionKnowledgeProvider({ store = jsonKnowledgeStore, retriever,
  mode = 'development' } = {}) {
  if (!['development', 'production'].includes(mode)) throw new Error('Invalid corpus mode.');
  retriever ??= mode === 'production' ? keywordRetriever : createHybridRetriever();
  return Object.freeze({
    async search(input, { signal } = {}) {
      const request = searchSchema.parse(input);
      if (mode === 'production' && !request.traditionBranch) request.traditionBranch = inferTraditionBranch(request.query, request.tradition);
      signal?.throwIfAborted();
      const loaded = await store.load(knowledgeNamespaces[request.tradition], { signal });
      signal?.throwIfAborted();
      if (!Array.isArray(loaded) || loaded.length > 10000) throw knowledgeError();
      const records = loaded.map(record => knowledgeRecordSchema.parse(record));
      if (mode !== 'production') {
        if (records.some(record => record.metadata.licenseStatus === 'unknown')) throw knowledgeError();
        records.filter(record => !record.metadata.sample).forEach(requireProductionLicense);
      }
      if (records.some(record => record.tradition !== request.tradition)
          || new Set(records.map(record => record.sourceId)).size !== records.length) throw knowledgeError();
      const candidates = records.filter(record => record.language === request.language
        && (!request.traditionBranch || record.metadata.traditionBranch === request.traditionBranch)
        && (mode !== 'production' || productionEligible(record)));
      const retrieval = retriever.retrieve
        ? await retriever.retrieve({ records: structuredClone(candidates), ...request }, { signal })
        : { records: await retriever.rank({ records: structuredClone(candidates), ...request }, { signal }) };
      const ranked = retrieval.records;
      signal?.throwIfAborted();
      const result = searchResultSchema.parse({ tradition: request.tradition, query: request.query, results: ranked,
        ...(retrieval.diagnostics ? { diagnostics: retrieval.diagnostics } : {}),
      });
      if (result.diagnostics && (result.diagnostics.scores.length !== result.results.length
          || result.diagnostics.scores.some((score, index) => score.sourceId !== result.results[index].sourceId))) throw knowledgeError();
      // A replacement retriever may reorder, but cannot introduce or rewrite evidence.
      if (result.results.length > request.limit || new Set(result.results.map(r => r.sourceId)).size !== result.results.length
          || result.results.some(record => !candidates.some(candidate => isDeepStrictEqual(candidate, record)))) throw knowledgeError();
      return result;
    },
  });
}
