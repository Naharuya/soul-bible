const patterns = {
  medical: [/가슴이 너무 아프/, /숨을 못 쉬/, /의식을 잃/, /심한 출혈/, /약을 너무 많이 먹/],
  violence: [/죽이고 싶/, /해치고 싶/, /복수하고 싶/, /다치게 하/, /공격하고 싶/],
  active: [/죽고 싶/, /자살하고 싶/, /목숨을 끊/, /나를 해치/, /자해하고 싶/, /끝내 버리고 싶/, /자(?:해|살)(?:할|하려는|하려고)(?:생각|계획|마음|해)/],
  passive: [/사라지고 싶/, /눈을 뜨지 않았으면/, /사는 의미가 없/, /살 이유가 없/, /모든 걸 포기하고 싶/, /없어졌으면 좋겠/],
  psychosis: [/생각을 읽고 있/, /누가 나를 감시/, /목소리가 시켜/, /환청/, /내 머릿속에 말/],
  imminent: [/계획을 세웠/, /방법을 정했/, /유서를/, /준비해 뒀/, /실행할/, /도구를 준비/, /위험한 물건/, /수단이 있/, /이미 준비/, /오늘 밤/, /지금 당장/, /오늘 하/, /곧 실행/, /몇 시에/],
};

export function assessCrisis(raw) {
  // Match the same whitespace-insensitive form as Flutter.
  const text = raw.toLowerCase().replace(/[^\w가-힣]/g, '');
  const matches = (pattern) => new RegExp(pattern.source.replaceAll(' ', '')).test(text);
  if (patterns.medical.some(matches)) return { level: 3, immediate: true, kind: 'medical' };
  const imminent = patterns.imminent.some(matches) || /자(?:해|살)(?:할|하려는)(?:생각과)?계획/.test(text);
  if (patterns.violence.some(matches)) return { level: imminent ? 3 : 2, immediate: imminent, kind: 'violence' };
  if (patterns.active.some(matches)) return { level: imminent ? 3 : 2, immediate: imminent, kind: 'self_harm' };
  if (patterns.passive.some(matches)) return { level: 1, immediate: false, kind: 'passive_self_harm' };
  if (patterns.psychosis.some(matches)) return { level: 1, immediate: false, kind: 'psychosis' };
  return { level: 0, immediate: false, kind: 'safe' };
}

// A previous crisis cannot be cleared by a generic follow-up or local fallback.
// Session hints may only raise risk, never lower the current input assessment.
export function assessRequestCrisis(body) {
  const session = body.session || {};
  const current = assessCrisis(body.userMessage);
  const custom = assessCrisis(session.customEmotion || '');
  const prior = Number.isInteger(session.riskLevel) && session.riskLevel >= 0 && session.riskLevel <= 3 ? session.riskLevel : 0;
  const level = Math.max(current.level, custom.level, prior, session.currentStage === 'crisis' ? 1 : 0);
  const strongest = custom.level > current.level ? custom : current;
  const kind = level > strongest.level ? 'session_crisis' : strongest.kind;
  return { level, immediate: level >= 3, kind };
}

export function crisisResponse(emotion, assessment) {
  const urgent = assessment.level >= 3;
  return {
    message: urgent
      ? '지금은 안전을 확보하는 일이 가장 중요합니다. 가능하다면 위험한 물건에서 멀어지고, 믿을 수 있는 사람에게 곁에 있어 달라고 부탁해 주세요. 다쳤거나 자신 또는 다른 사람을 곧 해칠 위험이 있다면 현지 응급 서비스에 바로 연락해 주세요. 한국에서는 응급 구조 119·긴급 신고 112를 이용할 수 있습니다. 저는 직접 출동하거나 구조를 요청할 수 없습니다.'
      : '그 마음을 혼자 견디지 않으셔도 됩니다. 믿을 수 있는 주변 사람에게 지금 상태를 알리고, 상담 전문가나 의료진의 도움을 받아 주세요. 한국에서는 자살예방상담전화 109에 연락할 수 있습니다. 지금 다쳤거나 자신 또는 다른 사람을 해칠 위험이 급박하면 현지 응급 서비스에 바로 연락해 주세요. 한국에서는 119·112를 이용할 수 있습니다.',
    question: '지금 안전한 곳에 계신가요? 곁에 함께 있어 줄 사람에게 연락할 수 있나요?',
    stage: 'crisis', detectedEmotion: emotion, secondaryEmotion: null,
    riskLevel: assessment.level, shouldOfferVerse: false, verseTags: [], actionTags: ['현실지원연결'],
    shouldEndConversation: true, suggestedVerseId: null,
    agent: 'integrated', memorySummary: '위기 신호가 감지되어 현실의 안전 지원을 우선해야 합니다.',
    clinicalReflection: null, integratedInsight: null,
  };
}
