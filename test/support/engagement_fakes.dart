import 'dart:convert';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/notifications/reminder_controller.dart';
import 'package:onaria/engagement/storage.dart';
import 'package:onaria/onaria.dart';

class MemoryEngagementStorage implements EngagementStorage {
  final values = <String, String>{};
  bool failWrites = false;
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    if (failWrites) throw StateError('test write failure');
    values[key] = value;
  }
}

class TestVerseLoader implements VerseAssetLoader {
  @override
  Future<String> loadString(String path) async => jsonEncode({
        'verses': [
          for (var day = 1; day <= 7; day++)
            {
              'id': 'verse_$day',
              'book': '시편',
              'chapter': day,
              'verseStart': 1,
              'reference': '시편 $day:1',
              'translation': 'test',
              'text': '테스트 묵상 문구 $day',
              'englishText': '',
              'emotions': ['감사'],
              'tags': ['감사', '희망'],
              'reflectionQuestion': '오늘 기억하고 싶은 것은 무엇인가요?',
            },
        ]
      });
}

class TestNotifications implements NotificationGateway {
  bool granted = true;
  bool failInitialization = false;
  int permissionRequests = 0;
  int initializations = 0;
  void Function(ReminderKind)? tap;
  final plans = <PlannedReminder>[];
  @override
  Future<void> initialize(void Function(ReminderKind) onTap) async {
    initializations++;
    if (failInitialization) throw StateError('test initialization failure');
    tap = onTap;
  }

  @override
  Future<bool> hasPermission() async => granted;
  @override
  Future<bool> requestPermission() async {
    permissionRequests++;
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

EngagementController testEngagement(
        {required MemoryEngagementStorage storage,
        required DateTime Function() clock,
        TestNotifications? notifications}) =>
    EngagementController(
      storage: storage,
      clock: clock,
      verses: VerseRepository(loader: TestVerseLoader()),
      reminders: ReminderController(
          storage: storage,
          clock: clock,
          gateway: notifications ?? TestNotifications()),
    );
