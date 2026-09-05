import '../bible_mind_core.dart';

/// 서버 연결 전 제품 흐름을 검증하기 위한 결정적 데모 응답입니다.
class DemoLlmApiClient implements LlmApiClient {
  const DemoLlmApiClient();

  @override
  Future<LlmConversationResponse> send(LlmConversationRequest request) async {
    await Future<void>.delayed(const Duration(milliseconds: 650));
    final turn = request.session.turnCount;
    final emotion = request.session.selectedEmotion;

    if (turn == 0) {
      return LlmConversationResponse(
        message: '${emotion.naturalFeelingPhrase}을 혼자 견디고 계셨군요. 여기서는 서두르지 않아도 괜찮아요.',
        question: '그 마음이 가장 크게 느껴진 순간에는 어떤 일이 있었나요?',
        stage: ConversationStage.situation,
        detectedEmotion: emotion,
        riskLevel: 0,
        shouldOfferVerse: false,
        shouldEndConversation: false,
        agent: 'integrated',
        memorySummary: '사용자는 현재 ${emotion.label}과 관련된 상황을 돌아보고 있습니다.',
        integratedInsight: '감정을 알아차리고 말로 표현하는 것 자체가 마음을 돌보는 첫 단계가 될 수 있어요.',
      );
    }
    if (turn == 1) {
      return LlmConversationResponse(
        message: '그 상황이라면 마음이 무거워지는 것이 자연스러워요. 말씀해 주셔서 고마워요.',
        question: '그때 마음속에서 반복되던 생각은 무엇이었나요?',
        stage: ConversationStage.thought,
        detectedEmotion: emotion,
        riskLevel: 0,
        shouldOfferVerse: false,
        shouldEndConversation: false,
        agent: 'clinical_reflection',
        memorySummary: '사용자는 마음을 무겁게 만든 상황과 그때 떠오른 생각을 탐색하고 있습니다.',
        clinicalReflection: '상황과 생각을 나누어 보면 감정의 흐름을 조금 더 선명하게 볼 수 있어요.',
      );
    }
    return LlmConversationResponse(
      message: '지금의 마음 곁에 잠시 머물 수 있는 말씀을 함께 읽어볼까요?',
      question: null,
      stage: ConversationStage.verseOffer,
      detectedEmotion: emotion,
      riskLevel: 0,
      shouldOfferVerse: true,
      shouldEndConversation: false,
      agent: 'bible_ko',
      memorySummary: '사용자는 지금 마음에 머물 수 있는 말씀과 작은 실천을 준비하고 있습니다.',
      integratedInsight: '말씀을 읽기 전에도 자신의 마음을 충분히 살피고 선택할 권리가 있어요.',
    );
  }
}
