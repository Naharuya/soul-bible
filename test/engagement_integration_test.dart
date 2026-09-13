import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/onaria_app.dart';
import 'package:onaria/app/mind_card_store.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/onaria.dart';
import 'package:onaria/engagement/domain_events.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_game.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_page.dart';
import 'package:onaria/engagement/notifications/reminder_controller.dart';
import 'package:onaria/engagement/sharing/native_share.dart';
import 'package:onaria/engagement/sharing/share_card.dart';
import 'package:onaria/engagement/sharing/share_preview_page.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class _Notifications implements NotificationGateway {
  void Function(ReminderKind)? tap;
  bool granted = false;
  int requests = 0;
  final plans = <PlannedReminder>[];
  @override
  Future<void> initialize(void Function(ReminderKind) onTap) async {
    tap = onTap;
  }

  @override
  Future<bool> hasPermission() async => granted;
  @override
  Future<bool> requestPermission() async {
    requests++;
    return granted;
  }

  @override
  Future<void> cancelAll() async {
    plans.clear();
  }

  @override
  Future<void> schedule(PlannedReminder plan) async {
    plans.add(plan);
  }
}

class _Renderer extends ShareCardRenderer {
  _Renderer(this.bytes);
  final Uint8List bytes;
  @override
  Future<Uint8List> render(ShareCardContent content) async => bytes;
}

class _Share implements CardShareGateway {
  CardShareResult result = CardShareResult.dismissed;
  @override
  Future<CardShareResult> share(Uint8List png, Rect origin) async => result;
  @override
  Future<bool> save(Uint8List png) async => false;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Notifications gateway;
  late EngagementController controller;
  final analyticsEvents = <EngagementEvent>[];
  setUp(() async {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
    gateway = _Notifications();
    analyticsEvents.clear();
    controller =
        EngagementController(events: EngagementEventBus(sink: (event) async { analyticsEvents.add(event); }), reminders: ReminderController(gateway: gateway));
  });
  tearDown(() {
    controller.dispose();
    SharedPreferencesAsyncPlatform.instance = null;
  });

  Future<void> settle(WidgetTester tester) async {
    await tester.pump();
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump(const Duration(seconds: 1));
    if (find.byType(CrossLightPage).evaluate().isNotEmpty) {
      await tester.pump(const Duration(seconds: 1));
    } else {
      await tester.pumpAndSettle();
    }
  }

  Future<void> waitForMetric(
      WidgetTester tester, EngagementMetric metric) async {
    for (var i = 0; i < 30 && controller.metrics[metric.name] != 1; i++) {
      await settle(tester);
    }
  }

  Future<void> start(WidgetTester tester) async {
    await tester.runAsync(() async {
      await rootBundle.loadString('assets/data/bible_verses_ko.json');
      await controller.load();
    });
    await tester.pumpWidget(OnariaApp(engagement: controller));
    await settle(tester);
  }

  Future<void> menu(WidgetTester tester, String label) async {
    await tester.tap(find.byTooltip('메뉴'));
    await settle(tester);
    await tester.tap(find.text(label));
    await settle(tester);
  }

  testWidgets('menu opens game, settings and verse records; back returns home',
      (tester) async {
    await start(tester);
    expect(gateway.requests, 0);
    for (final entry in {
      '십자가 미니게임': '마음에 작은 빛을',
      '알림 설정': '원할 때만, 조용히',
      '말씀과 작은 기록': '오늘의 말씀',
    }.entries) {
      await menu(tester, entry.key);
      expect(find.text(entry.value), findsOneWidget);
      await tester.pageBack();
      await settle(tester);
      expect(find.byTooltip('메뉴'), findsOneWidget);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('growth opens tomorrow reminder settings without automatic opt-in', (tester) async {
    await start(tester);
    await menu(tester, '작은 성장 기록');
    expect(find.text('마음카드를 저장하면 작은 성장 기록이 이곳에 남아요.'), findsOneWidget);
    await tester.tap(find.text('다음날 알림 설정하기'));
    await settle(tester);
    expect(gateway.requests, 0);
    expect(gateway.plans, isEmpty);
    gateway.granted = true;
    await tester.tap(find.widgetWithText(SwitchListTile, '알림 사용'));
    await settle(tester);
    final now = controller.reminders.clock();
    expect(gateway.plans.single.at, DateTime(now.year, now.month, now.day + 1, 20));
    await tester.pageBack();
    await settle(tester);
    expect(find.text('작은 성장 기록'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('notification denial stays off and taps open saved verses',
      (tester) async {
    await start(tester);
    await menu(tester, '알림 설정');
    await tester.tap(find.widgetWithText(SwitchListTile, '알림 사용'));
    await settle(tester);
    expect(gateway.requests, 1);
    expect(controller.reminders.settings.enabled, isFalse);
    expect(gateway.plans, isEmpty);
    expect(find.textContaining('알림 권한이 허용되지'), findsOneWidget);
    await tester.pageBack();
    await settle(tester);
    gateway.tap!(ReminderKind.savedVerses);
    await settle(tester);
    expect(find.text('저장한 말씀'), findsNWidgets(2));
    expect(find.text('오늘의 말씀'), findsNothing);
  });

  testWidgets('saved verses survive controller restart and removal persists',
      (tester) async {
    await start(tester);
    await menu(tester, '말씀과 작은 기록');
    await tester.tap(find.text('말씀 저장'));
    await settle(tester);
    final id = controller.todayVerse!.id;
    expect(controller.savedVerseIds, contains(id));
    final restored =
        EngagementController(reminders: ReminderController(gateway: gateway));
    await tester.runAsync(() => restored.load());
    expect(restored.savedVerseIds, contains(id));
    await tester.runAsync(() => restored.removeVerse(id));
    restored.dispose();
    final removed =
        EngagementController(reminders: ReminderController(gateway: gateway));
    await tester.runAsync(() => removed.load());
    expect(removed.savedVerseIds, isEmpty);
    removed.dispose();
  });

  testWidgets(
      'crisis support pauses enabled reminders without waiting for notifications',
      (tester) async {
    for (final channel in [
      'flutter_tts',
      'plugin.csdcorp.com/speech_to_text'
    ]) {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
    }
    addTearDown(() {
      for (final channel in [
        'flutter_tts',
        'plugin.csdcorp.com/speech_to_text'
      ]) {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(MethodChannel(channel), null);
      }
    });
    await start(tester);
    gateway.granted = true;
    await tester.runAsync(() =>
        controller.reminders.configure(const ReminderSettings(enabled: true)));
    expect(gateway.plans, isNotEmpty);
    Navigator.of(tester.element(find.byTooltip('메뉴'))).push(
        MaterialPageRoute<void>(
            builder: (_) => const ConversationPage(
                emotion: EmotionType.anxiety, intensity: 5)));
    await settle(tester);
    await tester.enterText(find.byType(TextField), '죽고싶어요');
    await tester.tap(find.byTooltip('보내기'));
    await settle(tester);
    expect(find.text('지금 안전한 곳에 계신가요?'), findsOneWidget);
    await tester.runAsync(() => controller.reminders.visit());
    expect(controller.reminders.settings.paused, isTrue);
    expect(gateway.plans, isEmpty);
    gateway.tap!(ReminderKind.todayVerse);
    await settle(tester);
    expect(find.text('지금 안전한 곳에 계신가요?'), findsOneWidget);
    expect(find.text('말씀과 작은 기록'), findsNothing);
  });

  test('mind card share excludes private fields and unverified saved text', () {
    final card = MindCardRecord(
        id: 'private-id',
        createdAt: DateTime(2026),
        title: 'private-title',
        dateLabel: 'private-date',
        emotion: 'private-emotion',
        intensity: 9,
        verseReference: 'unknown',
        verseText: 'private-verse',
        englishVerseText: 'private-english',
        reflectionQuestion: 'private-question',
        action: 'private-action',
        closingMessage: 'private-closing',
        memorySummary: 'private-memory');
    final content = ShareCardContent.mindCard(card, []);
    expect(content.accessibleText, isNot(contains('private-')));
    expect(content.reference, isEmpty);
    expect(content.date, isNull);
  });

  testWidgets('game completes once and records a quiet moment', (tester) async {
    await start(tester);
    var now = DateTime(2026, 9, 10);
    final game = CrossLightGame(clock: () => now);
    final context = tester.element(find.byTooltip('메뉴'));
    final result = Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => CrossLightPage(game: game, continueToMindCard: true)));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.byKey(const ValueKey('cross-light-touch-peace')));
    await tester.pump();
    for (final word in crossLightWords.entries) {
      now = now.add(const Duration(seconds: 5));
      await tester.pump(const Duration(seconds: 5));
      await tester
          .ensureVisible(find.byKey(ValueKey('cross-light-touch-${word.key}')));
      await tester.tap(find.byKey(ValueKey('cross-light-touch-${word.key}')));
      await tester.pump();
    }
    await settle(tester);
    expect(game.complete, isTrue);
    await waitForMetric(tester, EngagementMetric.miniGameCompleted);
    expect(controller.metrics[EngagementMetric.miniGameCompleted.name], 1);
    final gameEvents = analyticsEvents.where((event) => event.type.wire.startsWith('cross_game_')).toList();
    expect(gameEvents.map((event) => event.type.wire), ['cross_game_started', 'cross_game_completed']);
    expect(gameEvents.every((event) => event.resourceRef == 'cross_light'), isTrue);
    expect(gameEvents.last.completed, isTrue);
    expect(gameEvents.last.entryPoint, 'mind_card');
    expect(gameEvents.last.durationMs, inInclusiveRange(25000, 60000));
    final reloaded = EngagementController(storage: controller.storage);
    await tester.runAsync(reloaded.load);
    expect(reloaded.crossGameAnalytics, {'cross_game_started': 1, 'cross_game_completed': 1, 'cross_game_skipped': 0, 'cross_game_replayed': 0});
    reloaded.dispose();
    await tester.scrollUntilVisible(find.text('작은 빛이 모였어요.'), 150,
        scrollable: find.byType(Scrollable).last);
    expect(find.text('작은 빛이 모였어요.'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('작은 성장 기록 보기'), 200,
        scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('작은 성장 기록 보기'));
    await settle(tester);
    expect(await result, isTrue);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('share cancellation does not count as completion',
      (tester) async {
    await start(tester);
    final share = _Share();
    final bytes = await tester
        .runAsync(() => ShareCardRenderer().render(ShareCardContent.prayer()));
    Navigator.of(tester.element(find.byTooltip('메뉴'))).push(
        MaterialPageRoute<void>(
            builder: (_) => SharePreviewPage(
                content: ShareCardContent.prayer(),
                gateway: share,
                renderer: _Renderer(bytes!))));
    await settle(tester);
    await tester.ensureVisible(find.text('이 이미지 공유하기'));
    await tester.tap(find.text('이 이미지 공유하기'));
    await settle(tester);
    expect(controller.metrics[EngagementMetric.shareCompleted.name] ?? 0, 0);
    share.result = CardShareResult.completed;
    await tester.tap(find.text('이 이미지 공유하기'));
    await settle(tester);
    await waitForMetric(tester, EngagementMetric.shareCompleted);
    expect(controller.metrics[EngagementMetric.shareCompleted.name], 1);
    expect(tester.takeException(), isNull);
  });
}
