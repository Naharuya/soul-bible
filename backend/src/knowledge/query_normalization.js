import { readFileSync } from 'node:fs';
import { knowledgeNamespaces } from './namespaces.js';

const concepts = JSON.parse(readFileSync(new URL('../../config/retrieval-concepts.json', import.meta.url), 'utf8'));
const branches = JSON.parse(readFileSync(new URL('../../config/tradition-branches.json', import.meta.url), 'utf8'));
export function inferTraditionBranch(query, tradition) {
  const normalized = query.normalize('NFKC').toLowerCase();
  const matches = Object.entries(branches[tradition] ?? {}).filter(([, names]) => names.some(name => {
    const lower = name.toLowerCase();
    return /^[a-z -]+$/.test(lower) ? new RegExp(`\\b${lower}\\b`, 'u').test(normalized) : normalized.includes(lower);
  })).map(([branch]) => branch);
  return matches.length === 1 ? matches[0] : undefined;
}
export function normalizeRetrievalQuery({ query, tradition, language = 'ko-KR' }, mapping = concepts) {
  if (!knowledgeNamespaces[tradition] || typeof query !== 'string') throw new Error('Invalid normalization context.');
  const normalized = query.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const matched = [...(mapping.common ?? []), ...(mapping[tradition] ?? [])].filter(concept => concept.terms.some(term => {
    const lowered = term.toLowerCase();
    return /^[a-z]+$/.test(lowered) ? new RegExp(`\\b${lowered}\\b`, 'u').test(lower) : lower.includes(lowered);
  }));
  // No translation fallback; concept labels may be bilingual but requested language stays fixed.
  const expansion = language === 'ko-KR' ? [...new Set(matched.flatMap(concept => concept.expansion))] : [];
  return { query: [normalized, ...expansion.filter(term => !lower.includes(term.toLowerCase()))].join(' ').slice(0, 2000),
    concepts: matched.map(concept => `${tradition}:${concept.id}`), originalQuery: query };
}
