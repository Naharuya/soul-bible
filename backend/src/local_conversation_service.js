const stageReplies = {
  situation: {
    message: (emotion) => `${emotion}한 마음을 안고 계셨군요. 서두르지 않고 지금 겪은 일을 함께 살펴볼게요.`,
    question: '그 마음이 가장 크게 느껴진 상황은 언제였나요?',
  },
  thought: {
    message: () => '그 상황이 마음에 오래 남아 있었던 것 같아요. 당시의 생각을 말로 꺼내는 것만으로도 마음을 정리하는 데 도움이 될 수 있어요.',
    question: '그 순간 머릿속에 가장 먼저 떠오른 생각은 무엇이었나요?',
  },
  need: {
    message: () => '그 생각 아래에는 지금 꼭 돌봄이 필요한 마음이 있는 것 같아요. 원하는 것을 바로 해결하지 못하더라도 필요를 알아차리는 일은 중요해요.',
    question: '지금 가장 필요하다고 느끼는 것은 위로, 이해, 쉼, 용기 중 무엇에 가까운가요?',
  },
  verse_offer: {
    message: () => '지금까지 나눈 마음을 잠시 품어 줄 말씀을 함께 바라봐도 좋겠습니다.',
    question: null,
  },
  action: {
    message: () => '말씀을 마음에 두고 오늘 할 수 있는 아주 작은 한 걸음을 정해 보세요. 부담 없이 가능한 만큼이면 충분합니다.',
    question: '지금 바로 할 수 있는 작은 행동 한 가지는 무엇일까요?',
  },
  summary: {
    message: () => '오늘 마음과 필요를 차분히 돌아보셨습니다. 스스로에게 조금 더 부드러운 시간을 허락해 주세요.',
    question: null,
  },
};

function selectStage(session) {
  if (session.verseAccepted === true || session.selectedVerse) return 'action';
  const turnCount = session.turnCount ?? 0;
  // The app has already asked about the situation before the first request.
  if (turnCount === 0) return 'thought';
  if (turnCount === 1) return 'need';
  if (turnCount <= 5) return 'verse_offer';
  return 'summary';
}

export function createLocalConversationService() {
  return async function generate(body, agent, memorySummary = '') {
    const stage = selectStage(body.session);
    const reply = stageReplies[stage];
    const shouldOfferVerse = stage === 'verse_offer' && body.allowedVerseIds.length > 0;
    const shouldEndConversation = stage === 'summary';
    const emotion = body.session.selectedEmotion;
    const summary = memorySummary || `${emotion}한 마음과 그 배경을 차분히 살펴보고 있습니다.`;

    return {
      message: reply.message(emotion),
      question: body.session.customEmotion && reply.question
        ? `“${body.session.customEmotion}”라고 적어 주신 마음을 떠올려 볼게요. ${reply.question}`
        : reply.question,
      stage,
      detectedEmotion: emotion,
      secondaryEmotion: null,
      riskLevel: 0,
      shouldOfferVerse,
      verseTags: [],
      actionTags: stage === 'action' ? ['작은 행동'] : [],
      shouldEndConversation,
      suggestedVerseId: shouldOfferVerse ? body.allowedVerseIds[0] : null,
      agent: agent.id,
      memorySummary: summary,
      clinicalReflection: agent.id === 'clinical_reflection'
        ? '상황과 생각, 감정과 필요를 구분해 바라보고 있습니다.'
        : null,
      integratedInsight: agent.id === 'integrated'
        ? '마음을 판단하지 않고 알아차리는 과정과 말씀 묵상을 함께 이어가고 있습니다.'
        : null,
    };
  };
}
