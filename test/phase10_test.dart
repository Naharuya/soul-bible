import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/mind_card_store.dart';
import 'package:onaria/app/seven_day_history.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/engagement_page.dart';
import 'package:onaria/engagement/journey/journey_page.dart';
import 'package:onaria/engagement/notifications/reminder_controller.dart';
import 'package:onaria/engagement/sharing/native_share.dart';
import 'package:onaria/engagement/sharing/share_card.dart';
import 'package:onaria/engagement/sharing/share_preview_page.dart';
import 'package:onaria/features/growth_page.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/features/check_in_page.dart';
import 'package:onaria/onaria.dart';
import 'package:onaria/features/seven_day_history_page.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'support/engagement_fakes.dart';

MindCardRecord card(DateTime at, {int intensity = 5}) => MindCardRecord(
  id: 'private-${at.toIso8601String()}', createdAt: at,
  title: '민수님 진단', dateLabel: 'private-date', emotion: '불안', intensity: intensity,
  verseReference: 'unknown', verseText: 'private-dialogue',
  reflectionQuestion: 'private-question', action: '물 한 잔 마시기',
  closingMessage: '치료되었습니다', memorySummary: 'private-memory',
  clinicalReflection: 'HIGH_RISK', integratedInsight: 'CRISIS');

class _Renderer extends ShareCardRenderer {
  @override
  Future<Uint8List> render(ShareCardContent content) async => base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==');
}

class _Share extends NativeCardShare {
  int calls = 0;
  bool fail = false;
  @override
  Future<CardShareResult> share(Uint8List png, Rect origin) async {
    calls++;
    if (fail) throw PlatformException(code: 'private-platform-detail');
    return CardShareResult.dismissed;
  }
}

class _NeverClient implements LlmApiClient {
  int calls = 0;
  @override
  Future<LlmConversationResponse> send(LlmConversationRequest request) async {
    calls++;
    throw StateError('Unexpected model request');
  }
}

void main() {
  setUp(() => SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty());
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  for (final allow in [false, true]) {
    test('consent $allow and chosen time survive restart; disable cancels', () async {
      final storage = MemoryEngagementStorage();
      final gateway = TestNotifications()..granted = allow;
      var controller = ReminderController(storage: storage, gateway: gateway);
      await controller.visit();
      expect(controller.settings.enabled, isFalse);
      expect(controller.consent, ReminderConsent.notAsked);
      expect(gateway.permissionRequests, 0);
      await controller.configure(const ReminderSettings(enabled: true, hour: 8, minute: 35));
      controller.dispose();
      controller = ReminderController(storage: storage, gateway: gateway);
      await controller.visit();
      expect(controller.settings.enabled, allow);
      expect(controller.consent, allow ? ReminderConsent.allowed : ReminderConsent.denied);
      expect(controller.settings.hour, 8);
      expect(controller.settings.minute, 35);
      expect(gateway.permissionRequests, allow ? 0 : 1);
      await controller.configure(const ReminderSettings(hour: 9));
      controller.dispose();
      controller = ReminderController(storage: storage, gateway: gateway);
      await controller.visit();
      expect(controller.consent, ReminderConsent.disabled);
      expect(gateway.plans, isEmpty);
      controller.dispose();
    });
  }

  test('old reminder settings remain compatible without consent field', () async {
    final storage = MemoryEngagementStorage();
    storage.values[ReminderController.storageKey] = jsonEncode({
      'settings': const ReminderSettings(enabled: true, hour: 7).toJson()});
    final controller = ReminderController(storage: storage, gateway: TestNotifications());
    await controller.visit();
    expect(controller.consent, ReminderConsent.allowed);
    expect(controller.settings.hour, 7);
    controller.dispose();
  });

  test('sanitizer excludes identity, dialogue, IDs, risk and clinical expressions', () {
    final content = SharePrivacySanitizer.mindCard(card(DateTime(2026)), []);
    for (final value in ['민수', '진단', '치료', 'private-', 'HIGH_RISK', 'CRISIS', '불안', '물 한 잔']) {
      expect(content.accessibleText, isNot(contains(value)));
    }
    expect(content.date, isNull);
  });

  test('seven calendar days include boundary, preserve order and exclude future', () {
    final now = DateTime(2027, 1, 3, 12);
    final days = sevenDayHistory([
      card(DateTime(2026, 12, 28)), card(DateTime(2026, 12, 27, 23, 59)),
      card(now, intensity: 3), card(DateTime(2027, 1, 3, 9), intensity: 8),
      card(now.add(const Duration(seconds: 1))),
    ], now);
    expect(days.length, 7);
    expect(days.first.cards.length, 1);
    expect(days[1].cards, isEmpty);
    expect(days.last.cards.map((c) => c.intensity), [8, 3]);
    expect(days.expand((d) => d.cards).length, 3);
  });

  test('history reads legacy store without rewriting it', () async {
    final store = MindCardStore();
    final original = card(DateTime(2026, 9, 13));
    await store.save(original);
    sevenDayHistory(await MindCardStore().getAll(), DateTime(2026, 9, 13, 12));
    expect((await store.getAll()).single.toJson(), original.toJson());
  });

  for (final hasData in [false, true]) {
    testWidgets('seven day screen handles partial/empty data: $hasData', (tester) async {
      final store = MindCardStore();
      if (hasData) await store.save(card(DateTime(2026, 9, 13)));
      await tester.pumpWidget(MaterialApp(home: SevenDayHistoryPage(
        store: store, clock: () => DateTime(2026, 9, 13, 12))));
      await tester.pumpAndSettle();
      expect(find.text('최근 7일 동안 저장한 마음 기록이 없어요.'), hasData ? findsNothing : findsOneWidget);
      if (hasData) {
        await tester.scrollUntilVisible(find.textContaining('선택한 작은 행동:'), 300);
        expect(find.textContaining('불안 · 5/10'), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    });
  }

  for (final risk in ['HIGH_RISK', 'CRISIS']) {
    testWidgets('$risk input activates safety latch before any share invitation', (tester) async {
      final client = _NeverClient();
      final controller = testEngagement(storage: MemoryEngagementStorage(), clock: DateTime.now);
      addTearDown(controller.dispose);
      for (final channel in ['flutter_tts', 'plugin.csdcorp.com/speech_to_text']) {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
        addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(MethodChannel(channel), null));
      }
      await tester.pumpWidget(EngagementScope(controller: controller, child: MaterialApp(
        home: ConversationPage(emotion: EmotionType.anxiety, intensity: 5, apiClient: client))));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField),
        risk == 'HIGH_RISK' ? '죽고 싶어요' : '죽고 싶고 지금 당장 실행할 생각이에요');
      await tester.tap(find.byTooltip('보내기'));
      await tester.pumpAndSettle();
      expect(controller.safetyBlocked, isTrue);
      expect(client.calls, 0);
      expect(find.text('마음 카드 공유하기'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });
    testWidgets('$risk blocks existing preview and game/journey invitations', (tester) async {
      final controller = testEngagement(storage: MemoryEngagementStorage(), clock: DateTime.now);
      addTearDown(controller.dispose);
      await controller.load();
      final gateway = _Share();
      Future<void> show(Widget page) async {
        await tester.pumpWidget(EngagementScope(controller: controller,
          child: MaterialApp(home: page)));
        await tester.pumpAndSettle();
      }
      await show(SharePreviewPage(content: ShareCardContent.prayer(), gateway: gateway, renderer: _Renderer()));
      expect(find.text('이 이미지 공유하기'), findsOneWidget);
      expect(gateway.calls, 0);
      controller.prioritizeSafety();
      await tester.pumpAndSettle();
      expect(find.text('이 이미지 공유하기'), findsNothing);
      expect(gateway.calls, 0);
      for (final page in [const GrowthPage(), const EngagementPage(), const JourneyPage()]) {
        await show(page);
        expect(find.textContaining('현실에서 안전'), findsOneWidget);
        expect(find.textContaining('게임하기'), findsNothing);
      }
      await show(const CheckInPage());
      await tester.tap(find.byTooltip('메뉴'));
      await tester.pumpAndSettle();
      expect(find.text('십자가 미니게임'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('preview requires tap; cancellation and platform failure are safe', (tester) async {
    final gateway = _Share();
    await tester.pumpWidget(MaterialApp(home: SharePreviewPage(
      content: ShareCardContent.prayer(), gateway: gateway, renderer: _Renderer())));
    await tester.pumpAndSettle();
    expect(gateway.calls, 0);
    await tester.ensureVisible(find.text('이 이미지 공유하기'));
    await tester.tap(find.text('이 이미지 공유하기'));
    await tester.pumpAndSettle();
    expect(gateway.calls, 1);
    expect(find.textContaining('취소했어요'), findsOneWidget);
    ScaffoldMessenger.of(tester.element(find.text('이 이미지 공유하기'))).clearSnackBars();
    await tester.pumpAndSettle();
    gateway.fail = true;
    await tester.tap(find.text('이 이미지 공유하기'));
    await tester.pumpAndSettle();
    expect(find.text('이미지를 준비하지 못했어요. 다시 시도해 주세요.'), findsOneWidget);
    expect(find.textContaining('private-platform-detail'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
