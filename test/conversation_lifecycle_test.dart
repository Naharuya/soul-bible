import 'dart:async';

import 'package:bible_mind_core/app/api_config.dart';
import 'package:bible_mind_core/app/app_theme.dart';
import 'package:bible_mind_core/bible_mind_core.dart';
import 'package:bible_mind_core/features/conversation_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class _PendingClient implements LlmApiClient {
  final result = Completer<LlmConversationResponse>();
  bool called = false;

  @override
  Future<LlmConversationResponse> send(LlmConversationRequest request) {
    called = true;
    return result.future;
  }
}

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
    for (final channel in ['flutter_tts', 'plugin.csdcorp.com/speech_to_text']) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
    }
  });
  tearDown(() {
    SharedPreferencesAsyncPlatform.instance = null;
  });

  for (final fail in [false, true]) {
    testWidgets('leaving chat before ${fail ? 'failure' : 'response'} is safe', (tester) async {
      rootBundle.clear();
      await tester.runAsync(() => rootBundle.loadString('assets/data/bible_verses_ko.json'));
      final client = _PendingClient();
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: ConversationPage(emotion: EmotionType.anxiety, intensity: 5, apiClient: client),
      ));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '내일 발표가 걱정돼요.');
      await tester.tap(find.byTooltip('보내기'));
      for (var i = 0; i < 50 && !client.called; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
        await tester.pump();
      }
      expect(client.called, isTrue);
      await tester.pumpWidget(const SizedBox.shrink());
      if (fail) {
        client.result.completeError(StateError('fixture failure'));
      } else {
        client.result.complete(const LlmConversationResponse(
          message: '발표를 앞두고 걱정되시는군요.',
          stage: ConversationStage.thought,
          detectedEmotion: EmotionType.anxiety,
          riskLevel: 0,
          shouldOfferVerse: false,
          shouldEndConversation: false,
        ));
      }
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('invalid API configuration reports setup failure without demo response', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: const ConversationPage(emotion: EmotionType.anxiety, intensity: 5),
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '내일 발표가 걱정돼요.');
    await tester.tap(find.byTooltip('보내기'));
    await tester.pumpAndSettle();
    expect(find.text('서버 설정을 확인할 수 없어요. 앱 설정을 확인한 뒤 다시 시도해 주세요.'), findsOneWidget);
    expect(find.textContaining('혼자 견디고 계셨군요'), findsNothing);
    expect(tester.takeException(), isNull);
  }, skip: ApiConfig.baseUrl != null);
}
