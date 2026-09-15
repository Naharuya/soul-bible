import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/mind_card_store.dart';
import 'package:onaria/app/conversation_draft.dart';
import 'package:onaria/app/verse_history.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/features/check_in_page.dart';
import 'package:onaria/onaria.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class _UnavailableUsage extends DailyUsageStore {
  @override
  Future<int> getCount() async => throw StateError('read failed');
  @override
  Future<bool> tryConsume() async => throw StateError('write failed');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty());
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  testWidgets('usage read and write failures do not block starting conversation', (tester) async {
    for (final channel in ['flutter_tts', 'plugin.csdcorp.com/speech_to_text']) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
    }
    await tester.pumpWidget(MaterialApp(home: CheckInPage(dailyUsageStore: _UnavailableUsage())));
    await tester.pumpAndSettle();
    for (var i = 0; i < 15 && find.text('불안').hitTestable().evaluate().isEmpty; i++) {
      await tester.drag(find.byType(ListView), const Offset(0, -180));
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('불안'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('AI 마음대화 시작하기'));
    await tester.tap(find.text('AI 마음대화 시작하기'));
    await tester.pumpAndSettle();
    expect(find.byType(ConversationPage), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('more than 101 cards survive concurrent writes, reopen and deletion', () async {
    await Future.wait(List.generate(120, (i) => MindCardStore().save(MindCardRecord(
      id: '$i', createdAt: DateTime(2026), title: 'test', dateLabel: 'test',
      emotion: 'test', intensity: 5, verseReference: '', verseText: '',
      reflectionQuestion: '', action: 'test', closingMessage: 'test'))));
    expect(await MindCardStore().getAll(), hasLength(120));
    await MindCardStore().delete('60');
    final cards = await MindCardStore().getAll();
    expect(cards, hasLength(119));
    expect(cards.any((c) => c.id == '0'), isTrue);
    expect(cards.any((c) => c.id == '60'), isFalse);
  });

  test('all emotions have verses and recent selections rotate across instances', () async {
    final json = jsonDecode(await rootBundle.loadString('assets/data/bible_verses_ko.json'));
    final verses = (json['verses'] as List).map((v) => BibleVerse.fromJson(v)).toList();
    expect(EmotionType.fromWire('벅참'), EmotionType.overwhelmed);
    expect(EmotionType.fromWire('unknown'), EmotionType.complexity);
    for (final emotion in EmotionType.values) {
      final candidates = verses.where((v) => v.emotions.contains(emotion)).toList();
      expect(candidates, isNotEmpty, reason: emotion.name);
      final seen = <String>{};
      for (var i = 0; i < candidates.length; i++) {
        seen.add((await VerseHistory().choose(candidates))!.id);
      }
      expect(seen.length, candidates.length, reason: emotion.name);
    }
  });

  testWidgets('back protects an unsent message and cancellation preserves it', (tester) async {
    for (final channel in ['flutter_tts', 'plugin.csdcorp.com/speech_to_text']) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
    }
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) => Scaffold(
      body: TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) =>
        const ConversationPage(emotion: EmotionType.joy, intensity: 5))), child: const Text('open'))))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '아직 보내지 않은 마음');
    await tester.pump();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('대화를 마칠까요?'), findsOneWidget);
    await tester.tap(find.text('계속 대화'));
    await tester.pumpAndSettle();
    expect(find.text('아직 보내지 않은 마음'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('입력 중 문장만 저장하고 나가기'));
    await tester.pumpAndSettle();
    expect(find.byType(ConversationPage), findsNothing);
    expect((await ConversationDraft.load())!.text, '아직 보내지 않은 마음');
    await tester.pumpWidget(const MaterialApp(home: CheckInPage()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('이어서 입력'));
    await tester.pumpAndSettle();
    expect(find.text('아직 보내지 않은 마음'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('저장하지 않고 나가기'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('임시 문장 삭제'));
    await tester.pumpAndSettle();
    expect(await ConversationDraft.load(), isNull);
    expect(tester.takeException(), isNull);
  });
}
