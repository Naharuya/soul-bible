import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/onaria.dart';
import 'package:speech_to_text/speech_recognition_result.dart';

class _Client implements LlmApiClient {
  final requests = <LlmConversationRequest>[];
  @override
  Future<LlmConversationResponse> send(LlmConversationRequest request) async {
    requests.add(request);
    throw StateError('offline fixture');
  }
}

void main() {
  for (final ending in ['final', 'stop', 'manual', 'empty', 'error', 'leave']) {
    testWidgets('voice input sends only finalized text once: $ending',
        (tester) async {
      const channel = 'plugin.csdcorp.com/speech_to_text';
      Future<void> event(String name, Object value) async {
        await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
          channel,
          const StandardMethodCodec().encodeMethodCall(MethodCall(name, value)),
          (_) {},
        );
        await tester.pump();
      }

      Future<void> words(String text, {bool finalResult = false}) => event(
          'textRecognition',
          jsonEncode({
            'alternates': [
              {'recognizedWords': text, 'confidence': 1.0}
            ],
            'resultType':
                (finalResult ? ResultType.finalResult : ResultType.partial)
                    .value,
          }));
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          const MethodChannel('flutter_tts'), (_) async => 1);
      tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(const MethodChannel(channel), (call) async {
        if (call.method == 'locales') return ['ko_KR:Korean'];
        return true;
      });
      await tester.runAsync(
          () => rootBundle.loadString('assets/data/bible_verses_ko.json'));
      final client = _Client();
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.light,
          home: ConversationPage(
              emotion: EmotionType.joy, intensity: 5, apiClient: client)));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('대화 방식과 말씀 언어'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('음성 인식 후 자동 전송'));
      await tester.tap(find.ancestor(
          of: find.text('음성 인식 후 자동 전송'),
          matching: find.byType(CheckedPopupMenuItem<String>)));
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      await tester.tap(find.bySemanticsLabel('음성으로 마음 말하기'));
      await tester.pumpAndSettle();
      await event('notifyStatus', 'listening');
      await words('음성 테스트');
      expect(client.requests, isEmpty);
      if (ending == 'stop') {
        await tester.tap(find.bySemanticsLabel('음성으로 마음 말하기'));
        await tester.pump();
      } else if (ending == 'manual') {
        await tester.tap(find.byTooltip('보내기'));
      } else if (ending == 'error') {
        await event('notifyError',
            jsonEncode({'errorMsg': 'error_audio', 'permanent': true}));
      } else if (ending == 'leave') {
        await tester.pumpWidget(const SizedBox.shrink());
      }
      await event('notifyStatus', 'notListening');
      await words(ending == 'empty' ? '' : '음성 테스트 완료', finalResult: true);
      await words('음성 테스트 완료', finalResult: true);
      await event('notifyStatus', 'done');
      for (var i = 0; i < 30; i++) {
        await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 10)));
        await tester.pump();
      }
      await tester.pumpAndSettle();
      final shouldSend = ['final', 'stop', 'manual'].contains(ending);
      expect(client.requests.length, shouldSend ? 1 : 0);
      if (shouldSend) {
        expect(client.requests.single.userMessage,
            ending == 'manual' ? '음성 테스트' : '음성 테스트 완료');
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}
