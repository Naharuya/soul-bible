import 'dart:async';

import 'package:onaria/app/api_config.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/onaria.dart';
import 'package:onaria/features/conversation_page.dart';
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

  testWidgets('local high risk stops before the client and never shows fallback', (tester) async {
    final client = _PendingClient();
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light,
      home: ConversationPage(emotion: EmotionType.anxiety, intensity: 5, apiClient: client)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '죽고싶어요');
    await tester.tap(find.byTooltip('보내기'));
    await tester.pumpAndSettle();
    expect(client.called, isFalse);
    expect(find.text('지금 안전한 곳에 계신가요?'), findsOneWidget);
    expect(find.textContaining('아래 번호는 한국 기준'), findsOneWidget);
    expect(find.text('자살예방상담전화 109'), findsOneWidget);
    expect(find.textContaining('AI 답변을 받지 못했어요'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('server risk opens fixed support before raw model text or verse lookup', (tester) async {
    rootBundle.clear();
    await tester.runAsync(() => rootBundle.loadString('assets/data/bible_verses_ko.json'));
    final client = _PendingClient();
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light,
      home: ConversationPage(emotion: EmotionType.anxiety, intensity: 5, apiClient: client)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '마음이 힘들어요');
    await tester.tap(find.byTooltip('보내기'));
    for (var i = 0; i < 50 && !client.called; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await tester.pump();
    }
    expect(client.called, isTrue);
    client.result.complete(const LlmConversationResponse(
      message: 'PRIVATE_RAW_MODEL', question: 'PRIVATE_RAW_MODEL',
      stage: ConversationStage.crisis, detectedEmotion: EmotionType.anxiety,
      riskLevel: 3, shouldOfferVerse: true, suggestedVerseId: 'invalid-verse', shouldEndConversation: true,
      clinicalReflection: 'PRIVATE_RAW_MODEL',
    ));
    await tester.pumpAndSettle();
    expect(find.text('자살예방상담전화 109'), findsOneWidget);
    expect(find.textContaining('PRIVATE_RAW_MODEL'), findsNothing);
    expect(find.textContaining('AI 답변을 받지 못했어요'), findsNothing);
    expect(tester.takeException(), isNull);
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

  testWidgets('invalid API configuration explains unavailable AI and continues locally', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: const ConversationPage(emotion: EmotionType.anxiety, intensity: 5),
    ));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '내일 발표가 걱정돼요.');
    await tester.tap(find.byTooltip('보내기'));
    await tester.pumpAndSettle();
    expect(find.textContaining('서버에 연결하지 못해 AI 답변을 받지 못했어요.'), findsOneWidget);
    expect(find.textContaining('혼자 견디고 계셨군요'), findsNothing);
    expect(tester.takeException(), isNull);
  }, skip: ApiConfig.baseUrl != null);
}
