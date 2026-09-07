import { sourceContextSchema } from './agent_contracts.js';
import { toLegacyReligion, specialistResultSchema } from './specialist_result.js';
import { scriptureAttribution, scriptureReference } from './prompts/religious_integrity_prompt.js';
import { exactCitationEvaluator, referenceMatches } from './citation_grounding.js';

const normalize = text => text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
const strongClaim = /(?:교리|경전|성경|꾸란|토라|하나님|하느님|알라|부처|구원|윤회|업보).{0,45}(?:반드시|절대|유일|확실|명령|보장|이다|입니다|가르칩니다)|(?:반드시|절대|유일).{0,45}(?:구원|윤회|교리)|(?:scripture|god|quran|torah).{0,40}(?:must|always|only|commands|guarantees)/iu;
const referencePattern = /(?:[\p{L}]+(?:\s+[\p{L}]+){0,2})\s*\d+\s*(?::|장|절)\s*\d*(?:절)?/gu;

function reject(category) {
  const error = new Error('Citation validation failed.');
  // Preserve existing integrity fallback categorization for invalid evidence.
  error.code = 'RELIGIOUS_INTEGRITY'; error.categories = [category]; error.validationStage = 'citation';
  throw error;
}

export function validateCitations(output, { tradition, sourceContext = [], evaluator = exactCitationEvaluator }) {
  const draft = toLegacyReligion(output);
  const sources = sourceContextSchema.parse(sourceContext);
  if (sources.some(source => source.religion !== tradition)) reject('interfaith_source');
  if (new Set(sources.map(source => source.id)).size !== sources.length) reject('fabricated_source_ref');
  const byId = new Map(sources.map(source => [source.id, source]));
  if (new Set(draft.sourceRefs).size !== draft.sourceRefs.length || draft.sourceRefs.some(id => !byId.has(id))) reject('fabricated_source_ref');
  const cited = draft.sourceRefs.map(id => byId.get(id));
  const fields = [draft.perspective, draft.guidance, draft.reflectionQuestion, ...draft.cautions,
    ...(Object.hasOwn(output, 'tradition') ? [specialistResultSchema.parse(output).emotionalSupport] : [])];
  let repair = false;
  for (const field of fields) {
    const text = normalize(field);
    const attributed = scriptureAttribution.test(text) || scriptureReference.test(text);
    if (attributed && !cited.length) reject('unsupported_scripture_quote');
    const references = [...text.matchAll(referencePattern)].map(match => match[0]);
    if (references.some(reference => !cited.some(source => referenceMatches(reference, source)))) repair = true;
    // Exact evidence for strong statements is intentionally conservative in this first retriever.
    if (strongClaim.test(text) || attributed) {
      const verdict = evaluator.evaluate({ claim: text, sources: cited });
      if (!verdict || verdict.supported !== true || verdict.exceedsEvidence !== false) repair = true;
    }
  }
  if (!repair) return { output, status: sources.length ? 'passed' : 'no_sources' };
  // Remove the whole religious claim set; do not try to invent a corrected doctrine.
  const safe = {
    perspective: '확인된 자료만으로는 이 종교적 주장에 답하기 어렵습니다.',
    guidance: '지금 필요한 돌봄을 살펴보고 원하시면 신뢰하는 공동체에 질문해 보세요.',
    reflectionQuestion: '지금 어떤 도움이 가장 필요하신가요?', sourceRefs: [], cautions: [],
  };
  const repaired = Object.hasOwn(output, 'tradition') ? specialistResultSchema.parse({ ...output,
    confidence: 0, religiousInsight: safe.perspective, suggestedPractice: {
      guidance: safe.guidance, reflectionQuestion: safe.reflectionQuestion,
    }, caution: [], sourceHints: [],
  }) : safe;
  // The caller must still run Religious Integrity; failed repair uses local fallback.
  return { output: repaired, status: 'repaired' };
}
