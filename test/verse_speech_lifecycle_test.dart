import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/onaria.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class _OfflineClient implements LlmApiClient {
  int calls = 0;
  @override
  Future<LlmConversationResponse> send(LlmConversationRequest request) async {
    calls++;
    throw StateError('offline');
  }
}

void main() {
  for (final action in ['stop', 'leave', 'complete', 'error']) {
    testWidgets('bilingual speech lifecycle: $action', (tester) async {
      SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
      addTearDown(() => SharedPreferencesAsyncPlatform.instance = null);
      final pending = Completer<int>();
      var spoken = 0;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('flutter_tts'), (call) async {
          if (call.method == 'speak') {
            spoken++;
            if (action == 'error') throw PlatformException(code: 'tts_unavailable');
            return pending.future;
          }
          if (call.method == 'stop' && !pending.isCompleted) pending.complete(1);
          return 1;
        });
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('plugin.csdcorp.com/speech_to_text'), (_) async => true);
      await tester.runAsync(() => rootBundle.loadString('assets/data/bible_verses_ko.json'));
      final client = _OfflineClient();
      await tester.pumpWidget(MaterialApp(theme: AppTheme.light,
        home: ConversationPage(emotion: EmotionType.admiration, intensity: 5, apiClient: client)));
      await tester.pumpAndSettle();
      for (var turn = 0; turn < 3; turn++) {
        await tester.enterText(find.byType(TextField), '오늘 좋은 일이 있었어요');
        await tester.tap(find.byTooltip('보내기'));
        for (var i = 0; i < 50 && client.calls <= turn; i++) {
          await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
          await tester.pump();
        }
        await tester.pumpAndSettle();
      }
      final play = tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '오늘의 말씀 음성으로 듣기'));
      play.onPressed!();
      await tester.pumpAndSettle();
      expect(spoken, 1);
      if (action == 'leave') {
        await tester.pumpWidget(const SizedBox.shrink());
      } else if (action == 'stop') {
        tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, '말씀 낭독 멈추기')).onPressed!();
      } else if (action == 'complete') {
        pending.complete(1);
      }
      await tester.pumpAndSettle();
      expect(spoken, action == 'complete' ? 2 : 1);
      if (action != 'leave') {
        expect(find.text('말씀 낭독 멈추기'), findsNothing);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
}
