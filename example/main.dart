import 'package:bible_mind_core/bible_mind_core.dart';

Future<void> main() async {
  const detector = CrisisDetector();
  const machine = ConversationMachine();

  var session = const ConversationSession(
    sessionId: 'demo-session',
    selectedEmotion: EmotionType.anxiety,
    emotionIntensity: 4,
  );

  const userMessage = '회사에서 잘릴까 봐 불안해요.';
  final localRisk = detector.assess(userMessage);
  final localTransition = machine.applyLocalCrisis(
    session,
    localRisk,
    userMessage,
  );
  session = localTransition.session;

  if (localRisk.isCrisis) {
    print('위기 UI 표시: ${localTransition.uiAction}');
    return;
  }

  final client = ProxyLlmApiClient(
    endpoint: Uri.parse('https://YOUR_BACKEND.example.com/v1/mind/chat'),
    appTokenProvider: () async => null,
  );

  final request = LlmConversationRequest(
    session: session,
    userMessage: userMessage,
    systemPromptVersion: 'ko-v1.0',
    allowedVerseIds: const ['PHP_4_6_7', 'ISA_41_10'],
  );

  try {
    final response = await client.send(request);
    final transition = machine.applyLlmResponse(session, response);
    print(response.message);
    if (response.question != null) print(response.question);
    print('다음 UI: ${transition.uiAction}');
  } finally {
    client.close();
  }
}
