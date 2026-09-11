import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/engagement/domain_events.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/notifications/reminder_controller.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_game.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_page.dart';
import 'support/engagement_fakes.dart';

void main() {
  testWidgets('replay button scrolls fully above the phone navigation area',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    var now = DateTime(2026, 9, 11);
    final game = CrossLightGame(clock: () => now)..start();
    for (final word in crossLightWords.keys) {
      now = now.add(const Duration(seconds: 5));
      game.collect(word);
    }
    await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
                padding: const EdgeInsets.only(bottom: 48),
                textScaler: const TextScaler.linear(2),
                disableAnimations: true),
            child: child!),
        home: CrossLightPage(game: game)));
    final replay = find.widgetWithText(TextButton, '한 번 더 빛 모으기');
    await tester.scrollUntilVisible(replay, 200);
    await tester.pumpAndSettle();
    final bounds = tester.getRect(replay);
    expect(bounds.top, greaterThan(0));
    expect(bounds.bottom, lessThanOrEqualTo(640 - 48));
    expect(replay.hitTestable(), findsOneWidget);
    await tester.tap(replay);
    await tester.pumpAndSettle();
    expect(game.complete, isFalse);
    expect(game.pieces, isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'completion connects to the bundled rest scripture with its reference',
      (tester) async {
    var now = DateTime(2026, 9, 11);
    final game = CrossLightGame(clock: () => now)..start();
    for (final word in crossLightWords.keys) {
      now = now.add(const Duration(seconds: 5));
      game.collect(word);
    }
    final controller = EngagementController(
        storage: MemoryEngagementStorage(),
        reminders: ReminderController(
            storage: MemoryEngagementStorage(), gateway: TestNotifications()));
    addTearDown(controller.dispose);
    await tester.runAsync(controller.load);
    final verse = controller.verse('MAT_11_28')!;
    await tester.pumpWidget(EngagementScope(
        controller: controller,
        child: MaterialApp(
            theme: AppTheme.light, home: CrossLightPage(game: game))));
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('cross-rest-verse')), 180);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text(verse.text), findsOneWidget);
    expect(find.text(verse.reference), findsOneWidget);
    expect(game.complete, isTrue);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'background pause keeps progress; restart cancellation preserves it and confirmation resets it',
      (tester) async {
    var now = DateTime(2026, 9, 11);
    final game = CrossLightGame(clock: () => now);
    final controller =
        testEngagement(storage: MemoryEngagementStorage(), clock: () => now);
    addTearDown(controller.dispose);
    await controller.load();
    await tester.pumpWidget(EngagementScope(
        controller: controller,
        child: MaterialApp(
            theme: AppTheme.light, home: CrossLightPage(game: game))));
    expect(find.text('조용히 시작하기'), findsNothing);
    await tester
        .ensureVisible(find.byKey(const ValueKey('cross-light-touch-peace')));
    await tester.tap(find.byKey(const ValueKey('cross-light-touch-peace')));
    await tester.pump();

    expect(game.pieces, contains('peace'));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    now = now.add(const Duration(minutes: 2));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(game.paused, isTrue);
    expect(game.remainingSeconds, 5);
    await tester.scrollUntilVisible(find.text('이어서 하기'), 200);
    await tester.tap(find.text('이어서 하기'));
    await tester.pump();
    expect(game.paused, isFalse);
    await tester.tap(find.text('처음부터'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.text('취소'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(game.pieces, contains('peace'));
    await tester.tap(find.text('처음부터'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.text('다시 시작'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(game.pieces, isEmpty);
    expect(controller.metrics[EngagementMetric.miniGameStarted.name], 2);
    expect(controller.metrics[EngagementMetric.miniGameCompleted.name], isNull);
    expect(controller.crossGameAnalytics, {
      'cross_game_started': 2,
      'cross_game_completed': 0,
      'cross_game_skipped': 0,
      'cross_game_replayed': 1
    });
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'completion lights all six pieces and replay records one completion per round',
      (tester) async {
    var now = DateTime(2026, 9, 11);
    final game = CrossLightGame(clock: () => now);
    final controller =
        testEngagement(storage: MemoryEngagementStorage(), clock: () => now);
    addTearDown(controller.dispose);
    await controller.load();
    await tester.pumpWidget(EngagementScope(
        controller: controller,
        child: MaterialApp(
            theme: AppTheme.light, home: CrossLightPage(game: game))));
    expect(find.text('조용히 시작하기'), findsNothing);
    await tester
        .ensureVisible(find.byKey(const ValueKey('cross-light-touch-peace')));
    await tester.tap(find.byKey(const ValueKey('cross-light-touch-peace')));
    await tester.pump();
    for (var round = 1; round <= 2; round++) {
      for (final word in crossLightWords.entries
          .where((entry) => !game.pieces.contains(entry.key))) {
        now = now.add(const Duration(seconds: 5));
        await tester.pump(const Duration(seconds: 5));
        await tester.scrollUntilVisible(
            find.byKey(ValueKey('cross-light-touch-${word.key}')), 180);
        await tester.tap(find.byKey(ValueKey('cross-light-touch-${word.key}')));
        await tester.pump();
      }
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(game.complete, isTrue);
      expect(
          controller.metrics[EngagementMetric.miniGameCompleted.name], round);
      expect(controller.crossGameAnalytics, {
        'cross_game_started': round,
        'cross_game_completed': round,
        'cross_game_skipped': 0,
        'cross_game_replayed': round - 1
      });
      Offset center(String word) =>
          tester.getCenter(find.byKey(ValueKey('cross-light-touch-$word')));
      expect(center('peace').dx, center('love').dx);
      expect(center('love').dx, center('courage').dx);
      expect(center('courage').dx, center('forgiveness').dx);
      expect(center('hope').dy, center('love').dy);
      expect(center('love').dy, center('grace').dy);
      expect(center('hope').dx, lessThan(center('love').dx));
      expect(center('grace').dx, greaterThan(center('love').dx));
      expect(center('peace').dy, lessThan(center('love').dy));
      expect(center('forgiveness').dy, greaterThan(center('courage').dy));
      if (round == 1) {
        await tester.scrollUntilVisible(find.text('한 번 더 빛 모으기'), 180);
        await tester.ensureVisible(find.widgetWithText(TextButton, '한 번 더 빛 모으기'));
        await tester.pump(const Duration(seconds: 1));
        await tester.tap(find.text('한 번 더 빛 모으기'));
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
        expect(game.complete, isFalse);
      }
    }
    expect(controller.metrics[EngagementMetric.miniGameStarted.name], 2);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets(
      'small screen and large text keep the game usable with reduced motion',
      (tester) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
                textScaler: const TextScaler.linear(2),
                disableAnimations: true),
            child: child!),
        home: const CrossLightPage()));
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('cross-light-touch-peace')), 200);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.tap(find.byKey(const ValueKey('cross-light-touch-peace')));
    await tester.pump();
    await tester.scrollUntilVisible(find.text('잠시 쉬기'), 200);
    await tester.pump();
    await tester.tap(find.text('잠시 쉬기'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('이어서 하기'), findsOneWidget);
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('cross-piece-peace')), -250);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    final tile = tester.widget<AnimatedPositioned>(
        find.byKey(const ValueKey('cross-piece-peace')));
    expect(tile.duration, Duration.zero);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
