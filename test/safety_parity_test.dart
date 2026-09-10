import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:onaria/onaria.dart';

void main() {
  test('Flutter uses the same risk corpus as the backend', () {
    final cases = jsonDecode(File('backend_contract/safety_cases.json').readAsStringSync()) as List;
    for (final fixture in cases) {
      final assessment = const CrisisDetector().assess(fixture['text'] as String);
      expect(assessment.level, fixture['level'], reason: fixture['id'] as String);
      expect(assessment.requiresImmediateUi, (fixture['level'] as int) >= 3);
    }
  });
  for (final status in [200, 502]) {
    test('upstream $status cannot expose raw error or malformed model body', () async {
      const marker = 'sk-private-key-and-model-raw-output';
      final client = ProxyLlmApiClient(endpoint: Uri.parse('https://example.com/v1/mind/chat'),
        appTokenProvider: () async => null,
        httpClient: MockClient((_) async => http.Response(status == 200 ? marker : jsonEncode({'message': marker}), status)));
      addTearDown(client.close);
      final request = LlmConversationRequest(
        session: const ConversationSession(sessionId: 'privacy', selectedEmotion: EmotionType.anxiety, emotionIntensity: 5),
        userMessage: '불안해요', systemPromptVersion: 'ko-v1', allowedVerseIds: const [],
      );
      Object? failure;
      try { await client.send(request); } catch (error) { failure = error; }
      expect(failure, isNotNull);
      expect(failure.toString(), isNot(contains(marker)));
    });
  }
}
