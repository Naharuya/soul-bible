import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/onaria_app.dart';
import 'package:onaria/engagement/journey/journey_page.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'support/engagement_fakes.dart';

void main() {
  setUp(() => SharedPreferencesAsyncPlatform.instance =
      InMemorySharedPreferencesAsync.empty());
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  testWidgets(
      'menu starts a journey, preserves failed input, resumes next day and deletes',
      (tester) async {
    var now = DateTime(2026, 9, 11, 12);
    final storage = MemoryEngagementStorage();
    final controller = testEngagement(storage: storage, clock: () => now);
    addTearDown(controller.dispose);
    await controller.load();
    await tester.pumpWidget(OnariaApp(engagement: controller));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('메뉴'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('7일 마음의 여정'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('여정 시작하기'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('차분해요'));
    await tester.tap(find.text('차분해요'));
    await tester.enterText(
        find.byKey(const ValueKey('journey-note')), '오늘의 작은 순간');
    await tester.ensureVisible(find.text('오늘의 기록 남기기'));
    storage.failWrites = true;
    await tester.tap(find.text('오늘의 기록 남기기'));
    await tester.pumpAndSettle();
    expect(find.text('오늘의 작은 순간'), findsOneWidget);
    expect(controller.journey!.checkins, isEmpty);
    storage.failWrites = false;
    await tester.tap(find.text('오늘의 기록 남기기'));
    await tester.pumpAndSettle();
    expect(controller.journey!.checkins.length, 1);
    expect(find.byKey(const ValueKey('journey-note')), findsNothing);
    now = now.add(const Duration(days: 2));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('journey-note')), findsOneWidget);
    await tester.scrollUntilVisible(find.text('여정 기록 삭제'), 250,
        scrollable: find
            .descendant(
                of: find.byType(JourneyPage), matching: find.byType(Scrollable))
            .first);
    await tester.tap(find.text('여정 기록 삭제'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('취소'));
    await tester.pumpAndSettle();
    expect(controller.journey, isNotNull);
    await tester.tap(find.text('여정 기록 삭제'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('삭제'));
    await tester.pumpAndSettle();
    expect(controller.journey, isNull);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(JourneyPage), findsNothing);
    expect(find.byTooltip('메뉴'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
