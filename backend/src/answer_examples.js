import { z } from 'zod';
import { assessCrisis } from './crisis.js';
import { contentRules, scriptureAttribution, scriptureReference } from './agents/prompts/religious_integrity_prompt.js';

export const answerExamplesInstructions = `answerExamples에는 방금 만든 질문에 직접 답하는 서로 다른 1인칭 한국어 예시 2~3개를 함께 작성하세요. 각 예시는 20~35자 정도로 짧게 쓰세요. 현재 userMessage·감정·대화 문맥을 참고하되 사용자의 실제 답변이라고 단정하지 마세요. 선택지를 묻는 질문은 그 선택지에 답하고, 장면·이유·사람·행동을 묻는 질문은 각각 그 대상에 답하세요. 질문과 무관한 범용 문구, 질문 반복, 조언·명령, 진단, 위험행동, 경전 인용·구절 번호·교리 주장은 금지합니다. 질문이 없거나 위기 응답이면 빈 배열을 반환하세요.`;
export const answerExamplesJsonSchema = {
  type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 3,
};

// Invalid optional suggestions must never prevent delivery of the main answer.
export function safeAnswerExamples(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(value => typeof value === 'string')
    .map(value => value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim())
    .filter(value => value.length > 0 && value.length <= 60
      && /^(?:저는|제가|제 |나는|내 |지금은|오늘은|지금 |오늘 )/u.test(value)
      && !/[?？\n]|https?:|\d+\s*[:장절]\s*\d*/u.test(value)
      && assessCrisis(value).level === 0
      && !scriptureAttribution.test(value) && !scriptureReference.test(value)
      && !/(?:성경|경전|꾸란|토라|교리|하나님|하느님|알라|부처).*(?:말씀|가르|명령|뜻|구원)/u.test(value)
      && !contentRules.some(rule => rule.patterns.some(pattern => pattern.test(value)))))]
    .slice(0, 3);
}
export const answerExamplesSchema = z.unknown().transform(safeAnswerExamples).optional();
