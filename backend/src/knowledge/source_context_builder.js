import { sourceContextSchema } from '../agents/agent_contracts.js';
import { searchSchema, searchResultSchema, knowledgeError } from './contracts.js';
import { requireProductionLicense } from './source_quality.js';
import { assertProductionSource } from './production_guard.js';
import { inferTraditionBranch } from './query_normalization.js';

export function buildSourceContext(output, input, { mode = 'development' } = {}) {
  const request = searchSchema.parse(input);
  if (mode === 'production' && !request.traditionBranch) request.traditionBranch = inferTraditionBranch(request.query, request.tradition);
  const result = searchResultSchema.parse(output);
  if (mode === 'production') result.results.forEach(assertProductionSource);
  result.results.filter(source => !source.metadata.sample).forEach(requireProductionLicense);
  if (result.results.some(source => source.metadata.licenseStatus === 'unknown')) throw knowledgeError();
  if (result.diagnostics && (result.diagnostics.scores.length !== result.results.length
      || result.diagnostics.scores.some((score, index) => score.sourceId !== result.results[index].sourceId))) throw knowledgeError();
  if (result.tradition !== request.tradition || result.query !== request.query
      || result.results.length > request.limit
      || new Set(result.results.map(source => source.sourceId)).size !== result.results.length
      || result.results.some(source => source.tradition !== request.tradition || source.language !== request.language
        || (request.traditionBranch && source.metadata.traditionBranch !== request.traditionBranch))) throw knowledgeError();
  return sourceContextSchema.parse(result.results.map(source => ({
    id: source.sourceId, religion: source.tradition, reference: source.reference, text: source.text,
    sourceType: source.sourceType, title: source.title, language: source.language,
    authorityLevel: source.authorityLevel, metadata: source.metadata,
  })));
}
