import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:onaria/app/conversation_draft.dart';
import 'package:onaria/app/mind_card_store.dart';
import 'package:onaria/app/verse_narration.dart';
import 'package:onaria/app/seven_day_history.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/features/feedback_page.dart';
import 'package:onaria/features/privacy_page.dart';
import 'package:onaria/features/growth_page.dart';
import 'package:onaria/features/seven_day_history_page.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:onaria/onaria.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'support/engagement_fakes.dart';

class _Pending implements LlmApiClient {
  final requests = <LlmConversationRequest>[];
  final replies = <Completer<LlmConversationResponse>>[];
  @override
  Future<LlmConversationResponse> send(LlmConversationRequest request) {
    requests.add(request);
    final result = Completer<LlmConversationResponse>();
    replies.add(result);
    return result.future;
  }
}

const _reply = LlmConversationResponse(
    message: '테스트 응답',
    question: '지금 마음은 어떤가요?',
    stage: ConversationStage.need,
    detectedEmotion: EmotionType.joy,
    riskLevel: 0,
    shouldOfferVerse: false,
    shouldEndConversation: false);

MindCardRecord _card() => MindCardRecord(
    id: 'card-1',
    createdAt: DateTime(2026, 9, 12),
    title: '마음 카드',
    dateLabel: '9월 12일',
    emotion: '기쁨',
    intensity: 5,
    verseReference: '시편 23:1',
    verseText: '원문',
    reflectionQuestion: '질문',
    action: '물 한 잔 마시기',
    closingMessage: '수고했어요');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    for (final channel in [
      'flutter_tts',
      'plugin.csdcorp.com/speech_to_text'
    ]) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
    }
  });
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  test(
      'clearing saved verses removes associated identifiers and rolls back on storage failure',
      () async {
    final storage = MemoryEngagementStorage();
    storage.values[EngagementController.storageKey] = jsonEncode({
      'savedVerseIds': ['verse_1'],
      'gratitudeVerseIds': ['verse_1'],
    });
    final controller = testEngagement(storage: storage, clock: DateTime.now);
    await controller.load();
    storage.failWrites = true;
    await expectLater(controller.clearSavedVerses(), throwsStateError);
    expect(controller.savedVerseIds, {'verse_1'});
    storage.failWrites = false;
    await controller.clearSavedVerses();
    expect(controller.savedVerseIds, isEmpty);
    final data = jsonDecode(storage.values[EngagementController.storageKey]!);
    expect(data['gratitudeVerseIds'], isEmpty);
    controller.dispose();
  });

  test('next-day invitation excludes today, completed actions and old records',
      () {
    final card = _card();
    expect(actionToRevisit([card], DateTime(2026, 9, 12, 20)), isNull);
    expect(actionToRevisit([card], DateTime(2026, 9, 13)), card);
    expect(actionToRevisit([card], DateTime(2026, 9, 20)), isNull);
    final done =
        MindCardRecord.fromJson({...card.toJson(), 'actionReview': 'done'});
    expect(actionToRevisit([done], DateTime(2026, 9, 13)), isNull);
  });

  test(
      'voice selection prefers engine quality and excludes wrong language or network voices',
      () {
    final voices = narrationVoices([
      {
        'name': 'basic',
        'locale': 'ko-KR',
        'quality': 'normal',
        'network_required': '0'
      },
      {
        'name': 'download',
        'locale': 'ko-KR',
        'quality': 'very high',
        'features': 'notInstalled'
      },
      {
        'name': 'cloud',
        'locale': 'ko-KR',
        'quality': 'very high',
        'network_required': '1'
      },
      {
        'name': 'natural',
        'locale': 'ko_KR',
        'quality': 'high',
        'network_required': '0'
      },
      {'name': 'english', 'locale': 'en-US', 'quality': 'very high'},
    ], 'ko-KR');
    expect(voices.map((v) => v['name']), ['natural', 'basic']);
    expect(narrationVoices(1, 'ko-KR'), isEmpty);
  });

  test(
      'narration preserves exact body and handles missing English without inventing a translation',
      () {
    final verse = BibleVerse.fromJson({
      'id': 'id',
      'book': '시편',
      'chapter': 23,
      'verseStart': 1,
      'reference': '시편 23:1',
      'translation': 'KRV',
      'text': '원문 그대로, 읽습니다.',
      'emotions': [],
      'tags': [],
      'reflectionQuestion': '질문',
      'sourceUrl': 'https://evil.example/'
    });
    final segments = verseNarration(verse, 'english');
    expect(segments.single.$1, 'ko-KR');
    expect(segments.single.$2.split('\n\n').last, verse.text);
    expect(verse.verifiedSourceUrl, isNull);
  });

  test('draft serialization honors deletion and refuses crisis content',
      () async {
    final save = const ConversationDraft(
            text: '미완료 문장', emotion: EmotionType.joy, intensity: 5)
        .save();
    final remove = ConversationDraft.delete();
    await Future.wait([save, remove]);
    expect(await ConversationDraft.load(), isNull);
    await expectLater(
        const ConversationDraft(
                text: '죽고 싶어요', emotion: EmotionType.sadness, intensity: 5)
            .save(),
        throwsStateError);
    expect(await ConversationDraft.load(), isNull);
  });

  test(
      'action review survives reload without rewriting the original action and deletion removes it',
      () async {
    final store = MindCardStore();
    await store.save(_card());
    await store.reviewAction('card-1', 'changed',
        replacement: '잠시 쉬기', now: DateTime(2026, 9, 13));
    var saved = (await MindCardStore().getAll()).single;
    expect(saved.action, '물 한 잔 마시기');
    expect(saved.replacementAction, '잠시 쉬기');
    await store.reviewAction('card-1', 'done');
    saved = (await store.getAll()).single;
    expect(saved.actionReview, 'done');
    expect(saved.replacementAction, isNull);
    await store.delete('card-1');
    await expectLater(store.reviewAction('card-1', 'done'), throwsStateError);
    expect(await store.getAll(), isEmpty);
  });

  testWidgets(
      'local deletion requires confirmation and preserves unrelated preferences',
      (tester) async {
    final store = MindCardStore();
    await store.save(_card());
    await SharedPreferencesAsync().setString('other.preference', 'preserve');
    await tester.pumpWidget(const MaterialApp(home: PrivacyPage()));
    await tester.pumpAndSettle();
    final button = find.text('마음카드·실천 기록 전체 삭제');
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    await tester.tap(find.text('취소'));
    await tester.pumpAndSettle();
    expect(await store.getAll(), hasLength(1));
    await tester.tap(button);
    await tester.pumpAndSettle();
    await tester.tap(find.text('삭제'));
    await tester.pumpAndSettle();
    expect(await store.getAll(), isEmpty);
    expect(await SharedPreferencesAsync().getString('other.preference'),
        'preserve');
  });

  testWidgets(
      'feedback sends only selected categories after consent and retains selections on failure',
      (tester) async {
    final sent = <Map<String, dynamic>>[];
    final client = MockClient((request) async {
      sent.add(jsonDecode(request.body) as Map<String, dynamic>);
      return sent.length == 1
          ? http.Response('{}', 503)
          : http.Response('{"accepted":true}', 202);
    });
    await tester.pumpWidget(MaterialApp(home: FeedbackPage(client: client)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('도움됐어요'));
    await tester.tap(find.text('음성 듣기·입력'));
    await tester.pumpAndSettle();
    expect(sent, isEmpty);
    await tester.ensureVisible(find.text('선택한 의견 보내기'));
    await tester.tap(find.text('선택한 의견 보내기'));
    await tester.pumpAndSettle();
    expect(find.textContaining('의견을 보내지 못했어요'), findsOneWidget);
    await tester.tap(find.text('선택한 의견 보내기'));
    await tester.pumpAndSettle();
    expect(sent, hasLength(2));
    expect(sent.first.keys.toSet(), {'submissionId', 'rating', 'reason'});
    expect(sent.first, sent.last);
    expect(find.textContaining('의견을 받았어요'), findsOneWidget);
    client.close();
  });

  Future<void> waitForRequest(
      WidgetTester tester, _Pending client, int count) async {
    for (var i = 0; i < 50 && client.requests.length < count; i++) {
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)));
      await tester.pump();
    }
    expect(client.requests, hasLength(count));
  }

  testWidgets('failure restores input and explicit retry advances only once',
      (tester) async {
    await tester.runAsync(
        () => rootBundle.loadString('assets/data/bible_verses_ko.json'));
    final client = _Pending();
    await tester.pumpWidget(MaterialApp(
        home: ConversationPage(
            emotion: EmotionType.joy, intensity: 5, apiClient: client)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '보존할 문장');
    await tester.tap(find.byTooltip('보내기'));
    await waitForRequest(tester, client, 1);
    client.replies.first.completeError(StateError('offline'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        '보존할 문장');
    expect(find.textContaining('0/3'), findsOneWidget);
    await tester.tap(find.byTooltip('보내기'));
    await waitForRequest(tester, client, 2);
    client.replies.last.complete(_reply);
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView).first, const Offset(0, 1000));
    await tester.pumpAndSettle();
    expect(find.textContaining('1/3'), findsOneWidget);
    expect(client.requests.last.userMessage, '보존할 문장');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('cancel waiting restores input and ignores a late response',
      (tester) async {
    await tester.runAsync(
        () => rootBundle.loadString('assets/data/bible_verses_ko.json'));
    final client = _Pending();
    await tester.pumpWidget(MaterialApp(
        home: ConversationPage(
            emotion: EmotionType.joy, intensity: 5, apiClient: client)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '취소할 문장');
    await tester.tap(find.byTooltip('보내기'));
    await waitForRequest(tester, client, 1);
    await tester.ensureVisible(find.text('답변 기다리기 중지'));
    await tester.tap(find.text('답변 기다리기 중지'));
    client.replies.first.complete(_reply);
    await tester.pumpAndSettle();
    expect(find.text('테스트 응답'), findsNothing);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        '취소할 문장');
    expect(find.textContaining('0/3'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final enabled in [false, true]) {
    testWidgets('background draft recovery is opt-in: $enabled',
        (tester) async {
      await SharedPreferencesAsync()
          .setBool(ConversationDraft.autoSaveKey, enabled);
      await tester.pumpWidget(const MaterialApp(
          home: ConversationPage(emotion: EmotionType.joy, intensity: 5)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '이어서 적을 문장');
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      await tester.pumpAndSettle();
      expect(
          (await ConversationDraft.load())?.text, enabled ? '이어서 적을 문장' : null);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
      'voice defaults to review, preserves typed prefix and sends edited text only on tap',
      (tester) async {
    const channel = 'plugin.csdcorp.com/speech_to_text';
    tester.binding.defaultBinaryMessenger
        .setMockMethodCallHandler(const MethodChannel(channel), (call) async {
      if (call.method == 'locales') return ['ko_KR:Korean'];
      return true;
    });
    Future<void> event(String name, Object value) async {
      await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
          channel,
          const StandardMethodCodec().encodeMethodCall(MethodCall(name, value)),
          (_) {});
      await tester.pump();
    }

    final client = _Pending();
    await tester.runAsync(
        () => rootBundle.loadString('assets/data/bible_verses_ko.json'));
    await tester.pumpWidget(MaterialApp(
        home: ConversationPage(
            emotion: EmotionType.joy, intensity: 5, apiClient: client)));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '미리 쓴 문장');
    await tester.tap(find.bySemanticsLabel('음성으로 마음 말하기'));
    await tester.pumpAndSettle();
    await event(
        'textRecognition',
        jsonEncode({
          'alternates': [
            {'recognizedWords': '덧붙인 음성', 'confidence': 1.0}
          ],
          'resultType': ResultType.finalResult.value
        }));
    await tester.pumpAndSettle();
    expect(client.requests, isEmpty);
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text,
        '미리 쓴 문장 덧붙인 음성');
    await tester.enterText(find.byType(TextField), '수정한 문장');
    await tester.tap(find.byTooltip('보내기'));
    await waitForRequest(tester, client, 1);
    expect(client.requests.single.userMessage, '수정한 문장');
    client.replies.single.complete(_reply);
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
      'record and privacy screens support narrow display with 200 percent text',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await MindCardStore().save(_card());
    for (final page in [
      const GrowthPage(),
      SevenDayHistoryPage(clock: () => DateTime(2026, 9, 13)),
      const PrivacyPage(),
      const FeedbackPage()
    ]) {
      await tester.pumpWidget(MaterialApp(
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context)
                  .copyWith(textScaler: TextScaler.linear(2)),
              child: child!),
          home: page));
      await tester.pumpAndSettle();
      for (var step = 0; step < 5; step++) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -450));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      }
    }
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
