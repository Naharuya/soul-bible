import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/achievements/achievement.dart';
import 'package:onaria/engagement/domain_events.dart';
import 'package:onaria/engagement/easter_eggs/easter_egg.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'support/engagement_fakes.dart';

void main() {
  test(
      'journey resumes after gaps and restart, prevents duplicate days, completes once',
      () async {
    final storage = MemoryEngagementStorage();
    var now = DateTime(2026, 9, 11, 20);
    var controller = testEngagement(storage: storage, clock: () => now);
    await controller.startJourney();
    for (var day = 1; day <= 7; day++) {
      await controller.finishJourneyDay('차분해요', 'private-note-$day');
      await expectLater(
          controller.finishJourneyDay('차분해요', 'duplicate'), throwsStateError);
      expect(controller.journey!.checkins.length, day);
      if (day == 3) {
        controller.dispose();
        controller = testEngagement(storage: storage, clock: () => now);
        await controller.load();
        expect(controller.journey!.checkins.last.note, 'private-note-3');
      }
      now = now.add(const Duration(days: 2));
    }
    expect(controller.journey!.complete, isTrue);
    expect(controller.achievements, contains(Achievement.sevenDayJourney));
    expect(controller.eggs, contains(EasterEgg.journeyGarden));
    expect(controller.metrics[EngagementMetric.journeyCompleted.name], 1);
    await controller.emit(EngagementEventType.sevenDayJourneyProgress,
        journeyDay: 7);
    expect(controller.metrics[EngagementMetric.journeyCompleted.name], 1);
    final saved =
        jsonDecode(storage.values[EngagementController.storageKey]!) as Map;
    expect((saved['journey'] as Map)['completedAt'], isNotNull);
    await controller.deleteJourney();
    expect(storage.values[EngagementController.storageKey],
        isNot(contains('private-note')));
    controller.dispose();
    final restored = testEngagement(storage: storage, clock: () => now);
    await restored.load();
    expect(restored.journey, isNull);
    restored.dispose();
  });

  test(
      'storage failure rolls back final record, achievements and completion count together',
      () async {
    final storage = MemoryEngagementStorage();
    var now = DateTime(2026, 9, 11);
    final controller = testEngagement(storage: storage, clock: () => now);
    await controller.startJourney();
    for (var day = 0; day < 6; day++) {
      await controller.finishJourneyDay('가벼워요', 'note');
      now = now.add(const Duration(days: 1));
    }
    final before = storage.values[EngagementController.storageKey];
    storage.failWrites = true;
    await expectLater(
        controller.finishJourneyDay('가벼워요', 'last'), throwsStateError);
    expect(controller.journey!.checkins.length, 6);
    expect(
        controller.achievements, isNot(contains(Achievement.sevenDayJourney)));
    expect(controller.metrics[EngagementMetric.journeyCompleted.name], isNull);
    expect(storage.values[EngagementController.storageKey], before);
    storage.failWrites = false;
    await controller.finishJourneyDay('가벼워요', 'last');
    expect(controller.journey!.complete, isTrue);
    expect(controller.metrics[EngagementMetric.journeyCompleted.name], 1);
    controller.dispose();
  });

  test('concurrent check-ins commit only one record and failed delete keeps it',
      () async {
    final storage = MemoryEngagementStorage();
    final controller =
        testEngagement(storage: storage, clock: () => DateTime(2026, 9, 11));
    await controller.startJourney();
    final results = await Future.wait([
      controller
          .finishJourneyDay('차분해요', 'first')
          .then((_) => true, onError: (_) => false),
      controller
          .finishJourneyDay('차분해요', 'second')
          .then((_) => true, onError: (_) => false),
    ]);
    expect(results, [true, false]);
    storage.failWrites = true;
    await expectLater(controller.deleteJourney(), throwsStateError);
    expect(controller.journey!.checkins.single.note, 'first');
    controller.dispose();
  });

  test('failed metrics are not silently persisted by a later operation',
      () async {
    final storage = MemoryEngagementStorage();
    final controller =
        testEngagement(storage: storage, clock: () => DateTime(2026, 9, 11));
    await controller.load();
    storage.failWrites = true;
    await controller.track(EngagementMetric.shareCompleted);
    await controller.emit(EngagementEventType.miniGameCompleted);
    expect(controller.metrics, isEmpty);
    expect(controller.achievements, isEmpty);
    storage.failWrites = false;
    await controller.startJourney();
    expect(storage.values[EngagementController.storageKey],
        isNot(contains('firstShare')));
    controller.dispose();
  });
}
