export const agents = {
  bible_ko: {
    id: 'bible_ko',
    label: '한국어 성경 에이전트',
    instruction: '한국어 성경 본문과 묵상 질문을 중심으로 답합니다. 본문을 문자적으로 적용하거나 하나님의 뜻으로 단정하지 않습니다.',
  },
  bible_en: {
    id: 'bible_en',
    label: '영어 성경 에이전트',
    instruction: '영어 성경 본문과 한국어 설명을 함께 제공합니다. 영어 본문은 허용된 말씀 ID 안에서만 선택합니다.',
  },
  clinical_reflection: {
    id: 'clinical_reflection',
    label: '임상심리 성찰 에이전트',
    instruction: '임상심리 교육에 기반한 감정·상황·생각·욕구 성찰을 돕습니다. 진단, 치료, 처방, 임상적 판단을 하지 않습니다.',
  },
  integrated: {
    id: 'integrated',
    label: '심리 신앙 통합 에이전트',
    instruction: '심리적 성찰과 신앙적 묵상을 균형 있게 연결합니다. 심리 설명을 신앙 부족으로 환원하지 않고, 성경을 치료의 대체물로 제시하지 않습니다.',
  },
};

const keywordAgents = [
  { id: 'bible_en', pattern: /영어|english|niv|esv|영문/ },
  { id: 'bible_ko', pattern: /성경|말씀|구절|묵상|기도|한글/ },
  { id: 'clinical_reflection', pattern: /임상|심리|인지|생각의 오류|감정 조절|트라우마|상담 기법/ },
];

export function routeAgent({ requestedAgent = 'auto', userMessage = '', verseLanguage = 'bilingual' }) {
  if (requestedAgent && requestedAgent !== 'auto' && agents[requestedAgent]) return agents[requestedAgent];
  if (verseLanguage === 'english') return agents.bible_en;
  const match = keywordAgents.find(({ pattern }) => pattern.test(userMessage));
  return match ? agents[match.id] : agents.integrated;
}

export function buildAgentInstructions(agent) {
  return `${agent.instruction}\n\n공통 안전 규칙: 위기 신호가 있으면 현실의 즉각적인 지원을 우선하고 대화를 종료합니다. AI는 의료·상담·목회 전문가를 대체하지 않습니다.`;
}