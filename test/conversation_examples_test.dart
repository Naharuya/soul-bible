import 'package:onaria/app/app_theme.dart';
import 'package:onaria/onaria.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_page.dart';
import 'package:onaria/engagement/sharing/share_preview_page.dart';
import 'package:onaria/app/mind_card_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class _RetryCardStore extends MindCardStore {
  bool failNext = true;
  int attempts = 0;
  @override
  Future<void> save(MindCardRecord card) async {
    attempts++;
    if (failNext) {
      failNext = false;
      throw StateError('storage unavailable');
    }
    await super.save(card);
  }
}

class _ExampleClient implements LlmApiClient {
  _ExampleClient({this.failTurns = const []});
  final List<int> failTurns;
  final requests = <LlmConversationRequest>[];
  @override
  Future<LlmConversationResponse> send(LlmConversationRequest request) async {
    requests.add(request);
    if (failTurns.contains(requests.length)) throw StateError('network unavailable');
    return const LlmConversationResponse(
      message: '이야기해 주셔서 고마워요.', question: '그때 어떤 생각이 들었나요.',
      stage: ConversationStage.thought, detectedEmotion: EmotionType.admiration,
      riskLevel: 0, shouldOfferVerse: false, shouldEndConversation: false,
    );
  }
}

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
  });
  tearDown(() {
    SharedPreferencesAsyncPlatform.instance = null;
  });
  testWidgets('기타 입력이 첫 질문과 실패 후 질문 및 서버 요청에 유지된다', (tester) async {
    const feeling = '설레지만 조금 걱정돼요';
    for (final channel in ['flutter_tts', 'plugin.csdcorp.com/speech_to_text']) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
    }
    rootBundle.clear();
    await tester.runAsync(() => rootBundle.loadString('assets/data/bible_verses_ko.json'));
    final client = _ExampleClient(failTurns: [1]);
    await tester.pumpWidget(MaterialApp(theme: AppTheme.light,
      home: ConversationPage(emotion: EmotionType.complexity, intensity: 7,
        customEmotion: '  $feeling  ', apiClient: client)));
    await tester.pumpAndSettle();
    expect(find.text('“$feeling”라고 적어 주셨는데, 어떤 순간에 이런 마음이 들었나요?'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '새로운 일을 시작하게 됐어요.');
    await tester.tap(find.byTooltip('보내기'));
    for (var i = 0; i < 50 && client.requests.isEmpty; i++) {
      await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await tester.pump();
    }
    await tester.pumpAndSettle();
    expect(client.requests.single.session.toJson()['customEmotion'], feeling);
    expect(client.requests.single.session.lastAssistantQuestion, contains(feeling));
    expect(find.text('“$feeling”라는 마음과 관련해, 방금 이야기한 상황에서 가장 마음에 남는 것은 무엇인가요?'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  for (final failures in [<int>[], [1, 2, 3], [1, 3]]) {
  testWidgets('세 번째 대화 후 말씀 전환: 실패 회차 $failures', (tester) async {
    rootBundle.clear();
    await tester.runAsync(() => rootBundle.loadString('assets/data/bible_verses_ko.json'));
    for (final channel in ['flutter_tts', 'plugin.csdcorp.com/speech_to_text']) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(channel), (_) async => 1,
      );
    }
    final client = _ExampleClient(failTurns: failures);
    final store = _RetryCardStore();
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: ConversationPage(emotion: EmotionType.admiration, intensity: 7, apiClient: client, mindCardStore: store),
    ));
    await tester.pumpAndSettle();
    for (var turn = 1; turn <= 3; turn++) {
      await tester.enterText(find.byType(TextField), '오늘 자연을 보며 감탄했어요.');
      await tester.tap(find.byTooltip('보내기'));
      for (var i = 0; i < 50 && client.requests.length < turn; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(client.requests, hasLength(turn));
      expect(client.requests.last.session.turnCount, turn - 1);
      if (turn < 3) expect(find.byType(TextField), findsOneWidget);
    }
    expect(find.byType(TextField), findsNothing);
    expect(find.byTooltip('보내기'), findsNothing);
    expect(find.text('마음 대화'), findsNothing);
    expect(find.text('오늘의 말씀'), findsWidgets);
    expect(find.text('그때 어떤 생각이 들었나요?'), findsNothing);
    final next = find.text('작은 실천 정하기');
    await tester.ensureVisible(next);
    await tester.tap(next);
    await tester.pumpAndSettle();
    expect(find.text('작은 실천'), findsOneWidget);
    expect(find.text('오늘의 말씀'), findsNothing);
    final action = find.text('감동받은 내용을 깊이 묵상하기');
    await tester.ensureVisible(action);
    await tester.tap(action);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(CrossLightPage), findsOneWidget);
    expect(find.text('마음 카드 저장하기'), findsNothing);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('작은 실천'), findsOneWidget);
    await tester.ensureVisible(action);
    await tester.tap(action);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    // Exercise the game's completion result contract; game tests play all six lights.
    if (failures.isEmpty) {
      await tester.scrollUntilVisible(find.text('이번에는 건너뛰고 마음카드 보기'), 180);
      await tester.ensureVisible(find.widgetWithText(TextButton, '이번에는 건너뛰고 마음카드 보기'));
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.text('이번에는 건너뛰고 마음카드 보기'));
    } else {
      Navigator.of(tester.element(find.byType(CrossLightPage))).pop(true);
    }
    await tester.pumpAndSettle();
    expect(find.text('오늘의 마음 카드'), findsOneWidget);
    expect(find.text('감동받은 내용을 깊이 묵상하기'), findsOneWidget);
    await tester.ensureVisible(find.text('마음 카드 공유하기'));
    await tester.tap(find.text('마음 카드 공유하기'));
    await tester.pumpAndSettle();
    expect(find.byType(SharePreviewPage), findsNothing);
    expect(await store.getAll(), isEmpty);
    expect(find.text('마음 카드를 저장하지 못했어요. 다시 시도해 주세요.'), findsOneWidget);
    final shareAction = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, '마음 카드 공유하기')).onPressed!;
    shareAction();
    shareAction();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(SharePreviewPage), findsOneWidget);
    final savedBeforeSharing = await store.getAll();
    expect(savedBeforeSharing, hasLength(1));
    expect(store.attempts, 2);
    final preview = tester.widget<SharePreviewPage>(find.byType(SharePreviewPage));
    expect(preview.content.accessibleText, isNot(contains('오늘 자연을 보며 감탄했어요.')));
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('마음 카드 공유하기'));
    await tester.tap(find.text('마음 카드 공유하기'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(SharePreviewPage), findsOneWidget);
    expect(store.attempts, 2);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('마음 카드 저장하기'));
    await tester.tap(find.text('마음 카드 저장하기'));
    await tester.pumpAndSettle();
    final cards = await MindCardStore().getAll();
    expect(cards, hasLength(1));
    expect(cards.single.id, savedBeforeSharing.single.id);
    expect(store.attempts, 2);
    expect(find.text('작은 성장 기록'), findsOneWidget);
    expect(cards.single.action, '감동받은 내용을 깊이 묵상하기');
    expect(cards.single.intensity, 7);
    expect(client.requests, hasLength(3));
    expect(tester.takeException(), isNull);
  });
  }
  for (final scale in [1.0, 1.6, 2.0]) {
    testWidgets('예시 문구 전체 표시와 선택: 글자 배율 $scale', (tester) async {
      rootBundle.clear();
      await tester.runAsync(() => rootBundle.loadString('assets/data/bible_verses_ko.json'));
      final client = _ExampleClient();
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
        home: ConversationPage(emotion: EmotionType.admiration, intensity: 7, apiClient: client),
      ));
      await tester.pumpAndSettle();
      expect(find.text('질문'), findsOneWidget);
      expect(find.byTooltip('답변 듣기'), findsNothing);
      final question = find.text('무슨 일이 있었는지 편한 만큼 이야기해 주실래요?');
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
      final previousCount = find.byType(OutlinedButton).evaluate().length;
      await tester.tap(label);
      for (var i = 0; i < 50 && client.requests.isEmpty; i++) {
        await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(client.requests, hasLength(1));
      expect(client.requests.single.userMessage, prompt);
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, isEmpty);
      expect(find.ancestor(of: find.text(prompt), matching: find.byType(OutlinedButton)), findsNothing);
      expect(find.text('그때 어떤 생각이 들었나요?'), findsOneWidget);
      expect(find.byType(OutlinedButton).evaluate().length, previousCount);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    });
  }
}
