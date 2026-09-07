import 'dart:convert';
import 'dart:io';

import 'package:bible_mind_core/bible_mind_core.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('multi-agent HTTP fixture round-trips through the existing Dart parser',
      () {
    final json = jsonDecode(
        File('backend/test/fixtures/multi_agent_response.json')
            .readAsStringSync()) as Map<String, dynamic>;
    final response = LlmConversationResponse.fromJson(json);
    expect(response.toJson(), json);
    final transition = const ConversationMachine().applyLlmResponse(
      const ConversationSession(
          sessionId: 'contract',
          selectedEmotion: EmotionType.anxiety,
          emotionIntensity: 7,
          turnCount: 1),
      response,
    );
    expect(transition.uiAction, ConversationUiAction.showMessage);
    expect(transition.session.agentMemory, response.memorySummary);
  });
}
