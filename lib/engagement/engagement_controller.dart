import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import '../app/asset_loader.dart';
import '../src/verses/verse_models.dart';
import '../src/verses/verse_repository.dart';
import 'storage.dart';
import 'domain_events.dart';
import 'journey/journey.dart';
import 'achievements/achievement.dart';
import 'easter_eggs/easter_egg.dart';
import 'notifications/reminder_controller.dart';

class EngagementController extends ChangeNotifier {
  EngagementController(
      {EngagementStorage? storage,
      VerseRepository? verses,
      EngagementEventBus? events,
      DateTime Function()? clock,
      ReminderController? reminders})
      : storage = storage ?? PreferencesEngagementStorage(),
        verses =
            verses ?? VerseRepository(loader: const FlutterVerseAssetLoader()),
        events = events ?? EngagementEventBus(),
        clock = clock ?? DateTime.now,
        reminders = reminders ?? ReminderController();
  static const storageKey = 'soul_bible.engagement.v1';
  final EngagementStorage storage;
  final VerseRepository verses;
  final EngagementEventBus events;
  final DateTime Function() clock;
  final ReminderController reminders;
  SevenDayJourney? journey;
  final Set<String> _saved = {}, _gratitudeSaved = {};
  final Set<Achievement> _achievements = {};
  final Set<EasterEgg> _eggs = {};
  final Map<String, int> _metrics = {};
  List<BibleVerse> catalog = [];
  bool ready = false, _disposed = false;
  String? error;
  Future<void>? _loading;
  Future<void> _tail = Future.value();
  Set<String> get savedVerseIds => Set.unmodifiable(_saved);
  Set<Achievement> get achievements => Set.unmodifiable(_achievements);
  Set<EasterEgg> get eggs => Set.unmodifiable(_eggs);
  Map<String, int> get metrics => Map.unmodifiable(_metrics);
  Map<String, int> get crossGameAnalytics => Map.unmodifiable({
        'cross_game_started':
            _metrics[EngagementMetric.crossGameStarted.name] ?? 0,
        'cross_game_completed':
            _metrics[EngagementMetric.crossGameCompleted.name] ?? 0,
        'cross_game_skipped':
            _metrics[EngagementMetric.crossGameSkipped.name] ?? 0,
        'cross_game_replayed':
            _metrics[EngagementMetric.crossGameReplayed.name] ?? 0,
      });
  BibleVerse? verse(String? id) => catalog.where((v) => v.id == id).firstOrNull;
  BibleVerse? get todayVerse => catalog.isEmpty
      ? null
      : catalog[DateTime.utc(clock().year, clock().month, clock().day)
              .difference(DateTime.utc(2020))
              .inDays
              .abs() %
          catalog.length];
  BibleVerse? journeyVerse(int day) =>
      catalog.isEmpty ? null : catalog[(day - 1) % catalog.length];

  Future<void> load() => _loading ??= _load();
  Future<void> _load() async {
    try {
      catalog = await verses.loadAll();
      final raw = await storage.read(storageKey);
      if (raw != null) {
        final data = jsonDecode(raw) as Map<String, dynamic>;
        if (data['journey'] != null) {
          journey = SevenDayJourney.fromJson(
              Map<String, dynamic>.from(data['journey'] as Map));
        }
        _saved.addAll((data['savedVerseIds'] as List? ?? [])
            .whereType<String>()
            .where((id) => verse(id) != null));
        _gratitudeSaved.addAll(
            (data['gratitudeVerseIds'] as List? ?? []).whereType<String>());
        _achievements.addAll(Achievement.values.where(
            (a) => (data['achievements'] as List? ?? []).contains(a.name)));
        _eggs.addAll(EasterEgg.values
            .where((e) => (data['eggs'] as List? ?? []).contains(e.name)));
        for (final metric in EngagementMetric.values) {
          final value = (data['metrics'] as Map?)?[metric.name];
          if (value is int && value >= 0) _metrics[metric.name] = value;
        }
      }
      ready = true;
    } catch (_) {
      error = '기록을 불러오지 못했어요. 앱을 다시 열어 주세요.';
    }
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Map<String, Object?> _data() => {
        'version': 1,
        'journey': journey?.toJson(),
        'savedVerseIds': _saved.toList(),
        'gratitudeVerseIds': _gratitudeSaved.toList(),
        'achievements': _achievements.map((a) => a.name).toList(),
        'eggs': _eggs.map((e) => e.name).toList(),
        'metrics': _metrics
      };
  Future<void> _persist() => storage.write(storageKey, jsonEncode(_data()));
  Future<void> _change(void Function() change) async {
    final oldJourney = journey;
    final oldAchievements = Set<Achievement>.of(_achievements);
    final oldEggs = Set<EasterEgg>.of(_eggs);
    final oldGratitude = Set<String>.of(_gratitudeSaved);
    final oldMetrics = Map<String, int>.of(_metrics);
    try {
      change();
      await _persist();
    } catch (_) {
      journey = oldJourney;
      _achievements
        ..clear()
        ..addAll(oldAchievements);
      _eggs
        ..clear()
        ..addAll(oldEggs);
      _gratitudeSaved
        ..clear()
        ..addAll(oldGratitude);
      _metrics
        ..clear()
        ..addAll(oldMetrics);
      rethrow;
    }
    _notify();
  }

  Future<T> _serial<T>(Future<T> Function() action) {
    final future = _tail.then((_) async {
      await load();
      if (!ready) throw StateError('Storage unavailable');
      return action();
    });
    _tail = future.then<void>((_) {}, onError: (Object _, StackTrace __) {});
    return future;
  }

  Future<bool> saveVerse(BibleVerse selected) => _serial(() async {
        final canonical = verse(selected.id);
        if (canonical == null) throw ArgumentError('Unknown verse');
        if (_saved.contains(canonical.id)) return false;
        _saved.add(canonical.id);
        try {
          await _persist();
        } catch (_) {
          _saved.remove(canonical.id);
          rethrow;
        }
        _notify();
        unawaited(
            emit(EngagementEventType.verseSaved, resourceRef: canonical.id));
        return true;
      });
  Future<void> removeVerse(String id) => _serial(() async {
        final existed = _saved.remove(id);
        try {
          await _persist();
        } catch (_) {
          if (existed) _saved.add(id);
          rethrow;
        }
        _notify();
      });
  Future<void> startJourney() => _serial(() async {
        if (journey != null) return;
        await _change(() {
          journey = SevenDayJourney(
              journeyId: 'journey:${clock().microsecondsSinceEpoch}',
              startedAt: clock());
          _increment(EngagementMetric.journeyStarted);
        });
      });
  Future<void> finishJourneyDay(String mood, String note) => _serial(() async {
        final before = journey;
        if (before == null || journeyVerse(before.currentDay) == null) {
          throw StateError('Journey unavailable');
        }
        var unlockedGarden = false;
        await _change(() {
          journey = before.finishDay(
              now: clock(),
              mood: mood,
              note: note,
              verseId: journeyVerse(before.currentDay)!.id);
          _achievements.add(Achievement.firstReflection);
          if (journey!.complete) {
            _achievements.add(Achievement.sevenDayJourney);
            unlockedGarden = _eggs.add(EasterEgg.journeyGarden);
            _increment(EngagementMetric.journeyCompleted);
            _metrics[EngagementMetric.easterEggUnlocked.name] = _eggs.length;
          }
        });
        // The record and awards are already committed together. These are notifications only.
        unawaited(events.emit(EngagementEvent(
            EngagementEventType.dailyCheckinCompleted,
            occurredAt: clock())));
        unawaited(events.emit(EngagementEvent(
            EngagementEventType.sevenDayJourneyProgress,
            occurredAt: clock(),
            journeyDay: journey!.checkins.length)));
        if (unlockedGarden) {
          unawaited(events.emit(EngagementEvent(
              EngagementEventType.easterEggUnlocked,
              occurredAt: clock(),
              resourceRef: EasterEgg.journeyGarden.name)));
        }
      });
  Future<void> deleteJourney() => _serial(() async {
        final old = journey;
        journey = null;
        try {
          await _persist();
        } catch (_) {
          journey = old;
          rethrow;
        }
        _notify();
      });
  Future<void> emit(EngagementEventType type,
      {String? resourceRef,
      int? journeyDay,
      int? durationMs,
      bool? completed,
      String? entryPoint}) async {
    try {
      final event = EngagementEvent(type,
          occurredAt: clock(),
          resourceRef: resourceRef,
          durationMs: durationMs,
          completed: completed,
          entryPoint: entryPoint,
          journeyDay: journeyDay);
      await _serial(() async {
        final newEggs = <EasterEgg>[];
        void egg(EasterEgg value) {
          if (_eggs.add(value)) newEggs.add(value);
        }

        await _change(() {
          switch (type) {
            case EngagementEventType.dailyCheckinCompleted:
              _achievements.add(Achievement.firstReflection);
            case EngagementEventType.verseSaved:
              _achievements.add(Achievement.firstSavedVerse);
              final tags = verse(resourceRef)?.tags ?? [];
              if (tags.any(
                  (tag) => ['희망', '소망', 'hope'].contains(tag.toLowerCase()))) {
                _achievements.add(Achievement.hopeFinder);
              }
              if (tags.any((tag) =>
                      ['감사', 'gratitude'].contains(tag.toLowerCase())) &&
                  resourceRef != null) {
                _gratitudeSaved.add(resourceRef);
              }
              if (_saved.length >= 3) egg(EasterEgg.smallLight);
              if (_gratitudeSaved.length >= 3) egg(EasterEgg.gratitudeCard);
            case EngagementEventType.sevenDayJourneyProgress:
              if (journeyDay == 7 && journey?.complete == true) {
                _achievements.add(Achievement.sevenDayJourney);
                egg(EasterEgg.journeyGarden);
              }
            case EngagementEventType.miniGameCompleted:
              _achievements.add(Achievement.quietMoment);
              _increment(EngagementMetric.miniGameCompleted);
            case EngagementEventType.crossGameStarted:
              _increment(EngagementMetric.miniGameStarted);
              _increment(EngagementMetric.crossGameStarted);
            case EngagementEventType.crossGameCompleted:
              _achievements.add(Achievement.quietMoment);
              _increment(EngagementMetric.miniGameCompleted);
              _increment(EngagementMetric.crossGameCompleted);
            case EngagementEventType.crossGameSkipped:
              _increment(EngagementMetric.crossGameSkipped);
            case EngagementEventType.crossGameReplayed:
              _increment(EngagementMetric.crossGameReplayed);
            case EngagementEventType.shareCardRequested:
              _increment(EngagementMetric.shareRequested);
            case EngagementEventType.mindCardCreated:
              _achievements.add(Achievement.firstReflection);
            case EngagementEventType.easterEggUnlocked:
              break;
          }
          _metrics[EngagementMetric.easterEggUnlocked.name] = _eggs.length;
        });
        for (final value in newEggs) {
          unawaited(events.emit(EngagementEvent(
              EngagementEventType.easterEggUnlocked,
              occurredAt: clock(),
              resourceRef: value.name)));
        }
      });
      unawaited(events.emit(event));
    } catch (_) {
      /* Engagement does not interrupt check-in, saving or conversation. */
    }
  }

  void _increment(EngagementMetric metric) =>
      _metrics[metric.name] = (_metrics[metric.name] ?? 0) + 1;
  Future<void> track(EngagementMetric metric) async {
    try {
      await _serial(() async {
        await _change(() {
          _increment(metric);
          if (metric == EngagementMetric.shareCompleted) {
            _achievements.add(Achievement.firstShare);
          }
        });
      });
    } catch (_) {/* Only local, non-sensitive aggregate counters. */}
  }

  Future<void> visit() async {
    await reminders.visit();
  }

  @override
  void dispose() {
    _disposed = true;
    reminders.dispose();
    super.dispose();
  }
}

class EngagementScope extends InheritedNotifier<EngagementController> {
  const EngagementScope(
      {super.key,
      required EngagementController controller,
      required super.child})
      : super(notifier: controller);
  static EngagementController? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<EngagementScope>()?.notifier;
  static EngagementController of(BuildContext context) => maybeOf(context)!;
}
