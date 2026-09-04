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
    );
  }
}
