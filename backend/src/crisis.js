const patterns = {
  medical: [/가슴이 너무 아프/, /숨을 못 쉬/, /의식을 잃/, /심한 출혈/, /약을 너무 많이 먹/],
  violence: [/죽이고 싶/, /해치고 싶/, /복수하고 싶/, /다치게 하/, /공격하고 싶/],
  active: [/죽고 싶/, /자살하고 싶/, /목숨을 끊/, /나를 해치/, /자해하고 싶/, /끝내 버리고 싶/],
  passive: [/사라지고 싶/, /눈을 뜨지 않았으면/, /사는 의미가 없/, /살 이유가 없/, /모든 걸 포기하고 싶/, /없어졌으면 좋겠/],
  imminent: [/계획을 세웠/, /방법을 정했/, /유서를/, /준비해 뒀/, /실행할/, /도구를 준비/, /위험한 물건/, /수단이 있/, /이미 준비/, /오늘 밤/, /지금 당장/, /곧 실행/],
};

export function assessCrisis(raw) {
  const text = raw.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w가-힣 ]/g, '').trim();
  if (patterns.medical.some((p) => p.test(text))) return { level: 3, immediate: true, kind: 'medical' };
  const imminent = patterns.imminent.some((p) => p.test(text));
  if (patterns.violence.some((p) => p.test(text))) return { level: imminent ? 3 : 2, immediate: imminent, kind: 'violence' };
  if (patterns.active.some((p) => p.test(text))) return { level: imminent ? 3 : 2, immediate: imminent, kind: 'self_harm' };
  if (patterns.passive.some((p) => p.test(text))) return { level: 1, immediate: false, kind: 'passive_self_harm' };
  return { level: 0, immediate: false, kind: 'safe' };
}

export function crisisResponse(emotion, assessment) {
  const urgent = assessment.level >= 3;
  return {
    message: urgent
      ? '지금은 대화를 이어가기보다 안전을 확보하는 일이 가장 중요합니다. 위험한 물건에서 멀어지고 혼자 있지 말고, 즉시 112·119 또는 자살예방상담전화 109에 연락해 주세요.'
      : '그 마음을 혼자 견디지 않으셔도 됩니다. 지금 믿을 수 있는 사람에게 알리고 자살예방상담전화 109 또는 가까운 응급실의 도움을 받아 주세요.',
    question: urgent ? '지금 곁에 함께 있어 줄 사람에게 바로 연락할 수 있나요?' : '지금 연락할 수 있는 믿을 만한 사람이 있나요?',
    stage: 'crisis', detectedEmotion: emotion, secondaryEmotion: null,
    riskLevel: assessment.level, shouldOfferVerse: false, verseTags: [], actionTags: ['현실지원연결'],
    shouldEndConversation: false, suggestedVerseId: null,
  };
}
