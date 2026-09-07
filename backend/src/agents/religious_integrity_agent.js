import { sourceContextSchema, psychologySchema } from './agent_contracts.js';
import { contentRules, interfaithRules, scriptureMarker, scriptureAttribution, scriptureReference, prompt } from './prompts/religious_integrity_prompt.js';
import { toLegacyReligion, specialistResultSchema } from './specialist_result.js';

const normalize = (text) => text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();

function clauses(text) {
  return text.split(/[.!?。！？\n]+|하지만|그러나|그렇지만|그런데|다만/u).map(normalize).filter(Boolean);
}

function affirmative(pattern, clause) {
  const match = pattern.exec(clause);
  if (!match) return false;
  // Negation must follow the matched assertion in the same clause, not somewhere
  // else in the response. Contrastive conjunctions are split before this check.
  const tail = clause.slice(match.index + match[0].length);
  return !/^[^,;]{0,30}(?:않|아닙|아니|뜻은 아|필요는 없|해서는 안|하면 안|하지 마|말아|금지|피하기|피해야)/u.test(tail);
}

function inspectContent(fields, religion, sourceContext, sourceRefs) {
  const issues = new Set();
  const sources = sourceContext.filter((source) => source.religion === religion);
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  if (new Set(sourceRefs).size !== sourceRefs.length || sourceRefs.some((id) => !sourceMap.has(id))) issues.add('fabricated_source_ref');
  const cited = sourceRefs.map((id) => sourceMap.get(id)).filter(Boolean);
  for (const field of fields) {
    const text = normalize(field);
    for (const clause of clauses(text)) {
      for (const rule of contentRules) if (rule.patterns.some((pattern) => affirmative(pattern, clause))) issues.add(rule.category);
      if ((interfaithRules[religion] ?? []).some((pattern) => affirmative(pattern, clause))) issues.add('interfaith_mixing');
    }
    const quotes = [...text.matchAll(/"([^"\n]+)"|“([^”]+)”|「([^」]+)」|『([^』]+)』|(?<![\p{L}\p{N}])'([^'\n]+)'(?![\p{L}\p{N}])/gu)]
      .map((match) => match.slice(1).find((value) => value !== undefined));
    if ((scriptureReference.test(text) || scriptureAttribution.test(text)) && cited.length === 0) issues.add('unsupported_scripture_quote');
    if (scriptureAttribution.test(text) && cited.length > 0 && quotes.length === 0
        && !cited.some((source) => text.includes(normalize(source.text)))) issues.add('fabricated_quote');
    if (scriptureMarker.test(text) || sourceRefs.length > 0) {
      for (const quote of quotes) {
        if (cited.length === 0) issues.add('unsupported_scripture_quote');
        else if (!cited.some((source) => normalize(source.text).includes(normalize(quote)))) issues.add('fabricated_quote');
      }
    }
  }
  return [...issues];
}

function enforce(categories) {
  if (!categories.length) return;
  const error = new Error('Agent output failed content integrity review.');
  error.code = 'RELIGIOUS_INTEGRITY';
  error.categories = categories;
  error.policyVersion = prompt.version;
  throw error;
}

export function reviewPsychologyIntegrity(output, { religion }) {
  const result = psychologySchema.parse(output);
  enforce(inspectContent([result.emotionSummary, result.supportNeed, ...result.avoid], religion, [], []));
  return result;
}

export function reviewReligiousIntegrity(output, { religionAgent, sourceContext = [] }) {
  const canonical = Object.hasOwn(output, 'tradition') ? specialistResultSchema.parse(output) : null;
  if (canonical && (canonical.tradition !== religionAgent.id || canonical.agent !== religionAgent.identity)) enforce(['interfaith_mixing']);
  const result = toLegacyReligion(output);
  const sources = sourceContextSchema.parse(sourceContext);
  if (new Set(sources.map((source) => source.id)).size !== sources.length) enforce(['fabricated_source_ref']);
  enforce(inspectContent([...(canonical ? [canonical.emotionalSupport] : []), result.perspective, result.guidance, result.reflectionQuestion, ...result.cautions],
    religionAgent.id, sources, result.sourceRefs));
  return canonical ?? result;
}
