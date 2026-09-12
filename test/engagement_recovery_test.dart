import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/engagement_page.dart';
import 'support/engagement_fakes.dart';

class _RecoveringStorage extends MemoryEngagementStorage {
  bool failRead = true;
  @override
  Future<String?> read(String key) async {
    if (failRead) throw StateError('temporarily unavailable');
    return super.read(key);
  }
}

void main() {
  testWidgets('retry restores saved records after a transient read failure', (tester) async {
    final storage = _RecoveringStorage();
    storage.values[EngagementController.storageKey] = jsonEncode({'savedVerseIds': ['verse_1']});
    final controller = testEngagement(storage: storage, clock: () => DateTime(2026, 9, 11));
    addTearDown(controller.dispose);
    await controller.load();
    expect(controller.ready, isFalse);
    await tester.pumpWidget(EngagementScope(controller: controller,
        child: const MaterialApp(home: EngagementPage(savedOnly: true))));
    expect(find.text('다시 시도'), findsOneWidget);
    storage.failRead = false;
    await tester.tap(find.text('다시 시도'));
    await tester.pumpAndSettle();
    expect(controller.ready, isTrue);
    expect(controller.error, isNull);
    expect(controller.savedVerseIds, {'verse_1'});
    expect(find.text('테스트 묵상 문구 1'), findsOneWidget);
  });

  test('failed partial decoding does not leak stale records into a retry', () async {
    final storage = MemoryEngagementStorage();
    storage.values[EngagementController.storageKey] = jsonEncode({
      'savedVerseIds': ['verse_1'], 'gratitudeVerseIds': 123,
    });
    final controller = testEngagement(storage: storage, clock: DateTime.now);
    addTearDown(controller.dispose);
    await controller.load();
    expect(controller.ready, isFalse);
    storage.values[EngagementController.storageKey] = jsonEncode({'savedVerseIds': ['verse_2']});
    await controller.load();
    expect(controller.ready, isTrue);
    expect(controller.savedVerseIds, {'verse_2'});
  });
}
