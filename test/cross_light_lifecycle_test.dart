import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/domain_events.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_game.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_page.dart';
import 'package:onaria/engagement/notifications/reminder_controller.dart';
import 'package:onaria/onaria.dart';
import 'support/engagement_fakes.dart';

void main() {
  testWidgets('rotation preserves pieces and reduced motion keeps controls usable', (tester) async {
    tester.view.physicalSize = const Size(360, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final game = CrossLightGame();
    await tester.pumpWidget(MaterialApp(builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: true), child: child!),
      home: CrossLightPage(game: game)));
    await tester.tap(find.byKey(const ValueKey('cross-light-touch-peace')));
    await tester.pump();
    tester.view.physicalSize = const Size(720, 360);
    await tester.pump();
    expect(game.pieces, {'peace'});
    await tester.scrollUntilVisible(find.text('잠시 쉬기'), 140);
    await tester.tap(find.text('잠시 쉬기'));
    await tester.pumpAndSettle();
    expect(game.paused, isTrue);
    expect(find.text('이어서 하기'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });

  for (final skip in [false, true]) {
    testWidgets(
        '${skip ? 'skip' : 'back'} records once and reentry starts fresh',
        (tester) async {
      var now = DateTime(2026, 9, 11);
      final storage = MemoryEngagementStorage();
      final received = <EngagementEvent>[];
      final controller = EngagementController(
          storage: storage,
          clock: () => now,
          verses: VerseRepository(loader: TestVerseLoader()),
          reminders: ReminderController(
              storage: storage, gateway: TestNotifications()),
          events: EngagementEventBus(sink: (event) async {
            received.add(event);
          }));
      addTearDown(controller.dispose);
      await controller.load();
      late CrossLightGame game;
      bool? result;
      await tester.pumpWidget(EngagementScope(
          controller: controller,
          child: MaterialApp(
              home: Builder(
                  builder: (context) => Scaffold(
                      body: TextButton(
                          onPressed: () async {
                            game = CrossLightGame(clock: () => now);
                            result = await Navigator.push<bool>(
                                context,
                                MaterialPageRoute(
                                    builder: (_) => CrossLightPage(
                                        game: game, continueToMindCard: true)));
                          },
                          child: const Text('open')))))));
      await tester.tap(find.text('open'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.tap(find.byKey(const ValueKey('cross-light-touch-peace')));
      await tester.pump();
      now = now.add(const Duration(seconds: 7));
      if (skip) {
        await tester.scrollUntilVisible(find.text('이번에는 여기까지'), 200);
        await tester.tap(find.text('이번에는 여기까지'));
      } else {
        await tester.pageBack();
      }
      await tester.pumpAndSettle();
      expect(result, skip ? isFalse : isNull);
      final skipped = received
          .where((e) => e.type == EngagementEventType.crossGameSkipped)
          .single;
      expect(skipped.durationMs, 7000);
      expect(skipped.completed, isFalse);
      expect(skipped.entryPoint, 'mind_card');
      expect(controller.crossGameAnalytics['cross_game_skipped'], 1);
      expect(controller.crossGameAnalytics['cross_game_completed'], 0);
      await tester.tap(find.text('open'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(game.started, isFalse);
      expect(game.pieces, isEmpty);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(controller.crossGameAnalytics['cross_game_skipped'], 2);
      final reloaded = testEngagement(storage: storage, clock: () => now);
      await reloaded.load();
      expect(reloaded.crossGameAnalytics['cross_game_skipped'], 2);
      expect(CrossLightGame().pieces, isEmpty);
      reloaded.dispose();
      await tester.pumpWidget(const SizedBox());
      expect(tester.takeException(), isNull);
    });
  }

  test('analytics accepts only bounded entry identifiers and nonnegative time',
      () {
    expect(
        () => EngagementEvent(EngagementEventType.crossGameSkipped,
            occurredAt: DateTime(2026), entryPoint: 'private journal'),
        throwsArgumentError);
    expect(
        () => EngagementEvent(EngagementEventType.crossGameCompleted,
            occurredAt: DateTime(2026), durationMs: -1),
        throwsArgumentError);
    expect(
        () => EngagementEvent(EngagementEventType.verseSaved,
            occurredAt: DateTime(2026), completed: true),
        throwsArgumentError);
  });
}
