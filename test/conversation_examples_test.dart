import 'package:bible_mind_core/app/app_theme.dart';
import 'package:bible_mind_core/bible_mind_core.dart';
import 'package:bible_mind_core/features/conversation_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
  });
  tearDown(() {
    SharedPreferencesAsyncPlatform.instance = null;
  });
  for (final scale in [1.0, 1.6, 2.0]) {
    testWidgets('예시 문구 전체 표시와 선택: 글자 배율 $scale', (tester) async {
      tester.view.physicalSize = const Size(393, 840);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final channel in ['flutter_tts', 'plugin.csdcorp.com/speech_to_text']) {
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          MethodChannel(channel), (_) async => 1,
        );
      }
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: const ConversationPage(emotion: EmotionType.admiration, intensity: 7),
      ));
      await tester.pumpAndSettle();
      expect(find.text('질문'), findsOneWidget);
      expect(find.byTooltip('답변 듣기'), findsNothing);
      final question = find.text('무슨 일이 있었는지 편한 만큼만 들려주세요.');
      expect(question, findsOneWidget);
      expect(tester.renderObject<RenderParagraph>(question).didExceedMaxLines, isFalse);
      const prompt = '아름다운 노을을 보며 자연의 신비로움에 감탄했어요.';
      final label = find.text(prompt);
      final paragraph = tester.renderObject<RenderParagraph>(label);
      expect(paragraph.didExceedMaxLines, isFalse);
      final card = find.ancestor(of: label, matching: find.byType(OutlinedButton));
      final labelRect = tester.getRect(label);
      final cardRect = tester.getRect(card);
      expect(cardRect.contains(labelRect.topLeft), isTrue);
      expect(cardRect.contains(labelRect.bottomRight - const Offset(0.1, 0.1)), isTrue);
      expect(tester.takeException(), isNull);
      await tester.tap(label);
      await tester.pump();
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, prompt);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}
