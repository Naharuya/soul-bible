import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../storage.dart';
import 'native_notifications.dart';

enum ReminderKind {
  checkin('오늘의 마음 체크인', '오늘도 3분, 마음을 천천히 살펴볼까요?'),
  todayVerse('오늘의 말씀', '잠시 쉬어 가는 시간을 가져보세요.'),
  savedVerses('저장한 말씀 다시 보기', '전에 저장한 말씀을 다시 만나볼까요?'),
  gentle('부드러운 안부', '잠시 마음을 돌아보는 시간을 가져보세요.');

  const ReminderKind(this.label, this.message);
  final String label, message;
  static ReminderKind? fromPayload(String? payload) =>
      values.where((v) => payload == 'engagement:${v.name}').firstOrNull;
}

class ReminderSettings {
  const ReminderSettings(
      {this.enabled = false,
      this.hour = 20,
      this.minute = 0,
      this.kind = ReminderKind.checkin,
      this.gentle = false,
      this.startOn,
      this.paused = false});
  final DateTime? startOn;
  final bool enabled, gentle, paused;
  final int hour, minute;
  final ReminderKind kind;
  Map<String, Object?> toJson() => {
        'startOn': startOn?.toIso8601String(),
        'enabled': enabled,
        'hour': hour,
        'minute': minute,
        'kind': kind.name,
        'gentle': gentle,
        'paused': paused
      };
  factory ReminderSettings.fromJson(Map<String, dynamic> map) {
    final hour = map['hour'] as int? ?? 20, minute = map['minute'] as int? ?? 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw const FormatException('Invalid reminder time');
    }
    return ReminderSettings(
        startOn: DateTime.tryParse(map['startOn'] as String? ?? ''),
        enabled: map['enabled'] == true,
        hour: hour,
        minute: minute,
        kind: ReminderKind.values
                .where((v) => v.name == map['kind'] && v != ReminderKind.gentle)
                .firstOrNull ??
            ReminderKind.checkin,
        gentle: map['gentle'] == true,
        paused: map['paused'] == true);
  }
}

class PlannedReminder {
  const PlannedReminder(
      {required this.id,
      required this.kind,
      required this.at,
      required this.repeats});
  final int id;
  final ReminderKind kind;
  final DateTime at;
  final bool repeats;
  String get title => 'onaria';
  String get body => kind.message;
  String get payload => 'engagement:${kind.name}';
}

List<PlannedReminder> planReminders(
    ReminderSettings settings, DateTime now, DateTime lastVisit) {
  if (!settings.enabled || settings.paused) return [];
  if (settings.hour < 0 ||
      settings.hour > 23 ||
      settings.minute < 0 ||
      settings.minute > 59) {
    throw ArgumentError('Invalid time');
  }
  DateTime after(DateTime threshold) {
    var result = DateTime(threshold.year, threshold.month, threshold.day,
        settings.hour, settings.minute);
    if (!result.isAfter(threshold)) {
      result = DateTime(threshold.year, threshold.month, threshold.day + 1,
          settings.hour, settings.minute);
    }
    return result;
  }

  final away = lastVisit.add(const Duration(hours: 72));
  final start = settings.startOn;
  final threshold = start != null && start.isAfter(now)
      ? DateTime(start.year, start.month, start.day)
          .subtract(const Duration(microseconds: 1))
      : now;
  return [
    PlannedReminder(
        id: 1001, kind: settings.kind, at: after(threshold), repeats: true),
    if (settings.gentle)
      PlannedReminder(
          id: 1002,
          kind: ReminderKind.gentle,
          at: after(away.isAfter(now) ? away : now),
          repeats: false)
  ];
}

abstract interface class NotificationGateway {
  Future<void> initialize(void Function(ReminderKind kind) onTap);
  Future<bool> hasPermission();
  Future<bool> requestPermission();
  Future<void> cancelAll();
  Future<void> schedule(PlannedReminder plan);
}

class ReminderController extends ChangeNotifier {
  ReminderController(
      {NotificationGateway? gateway,
      EngagementStorage? storage,
      DateTime Function()? clock})
      : gateway = gateway ?? NativeNotifications(),
        storage = storage ?? PreferencesEngagementStorage(),
        clock = clock ?? DateTime.now;
  static const storageKey = 'soul_bible.reminders.v1';
  final NotificationGateway gateway;
  final EngagementStorage storage;
  final DateTime Function() clock;
  ReminderSettings settings = const ReminderSettings();
  DateTime? lastVisit;
  void Function(ReminderKind kind)? onTap;
  String? message;
  bool _disposed = false;
  bool ready = false;
  bool _pauseRequested = false;
  int _pauseVersion = 0;
  Future<void>? _loading;
  Future<void> _tail = Future.value();
  Future<void> load() =>
      _loading ??= _load().catchError((Object error, StackTrace stack) {
        _loading = null;
        ready = false;
        Error.throwWithStackTrace(error, stack);
      });
  Future<void> _load() async {
    final raw = await storage.read(storageKey);
    if (raw != null) {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      settings = ReminderSettings.fromJson(
          Map<String, dynamic>.from(data['settings'] as Map));
      lastVisit = DateTime.tryParse(data['lastVisit'] as String? ?? '');
    }
    _pauseRequested = _pauseRequested || settings.paused;
    if (_pauseRequested) _setPaused();
    await gateway.initialize((kind) {
      if (!_disposed) onTap?.call(kind);
    });
    ready = true;
    message = null;
    _notify();
  }

  Future<void> _persist() => storage.write(
      storageKey,
      jsonEncode({
        'settings': settings.toJson(),
        'lastVisit': lastVisit?.toIso8601String()
      }));
  Future<void> _serial(Future<void> Function() action) {
    final next = _tail.then((_) async {
      await load();
      await action();
    });
    _tail = next.catchError((Object _) {});
    return next;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  Future<void> _schedule() async {
    await gateway.cancelAll();
    if (!settings.enabled || settings.paused) return;
    if (!await gateway.hasPermission()) throw StateError('Permission denied');
    for (final plan in planReminders(settings, clock(), lastVisit ?? clock())) {
      await gateway.schedule(plan);
    }
  }

  Future<bool> configure(ReminderSettings requested) async {
    var success = false;
    final pauseVersion = _pauseVersion;
    try {
      await _serial(() async {
        await gateway.cancelAll();
        // Consent must come from this explicit settings action, never initialization/resume.
        if (requested.enabled &&
            !await gateway.hasPermission() &&
            !await gateway.requestPermission()) {
          settings = ReminderSettings(
              startOn: requested.startOn,
              hour: requested.hour,
              minute: requested.minute,
              kind: requested.kind,
              gentle: requested.gentle,
              paused: _pauseRequested);
          message = '알림 권한이 허용되지 않았어요. 알림 없이도 모든 기능을 사용할 수 있어요.';
          await _persist();
          return;
        }
        if (requested.enabled && pauseVersion != _pauseVersion) {
          _setPaused();
          await _persist();
          message = '알림이 일시 중지되어 있어요. 원할 때 다시 켤 수 있어요.';
          return;
        }
        if (requested.enabled && !requested.paused) _pauseRequested = false;
        settings = requested;
        if (_pauseRequested) _setPaused();
        await _schedule();
        await _persist();
        message = requested.enabled ? '선택한 시간에 조용히 알려드릴게요.' : '알림을 껐어요.';
        success = true;
      });
    } catch (_) {
      settings = ReminderSettings(
          startOn: requested.startOn,
          hour: requested.hour,
          minute: requested.minute,
          kind: requested.kind,
          gentle: requested.gentle,
          paused: _pauseRequested || requested.paused);
      try {
        await gateway.cancelAll();
        await _persist();
      } catch (_) {/* Retry cancellation on the next visit. */}
      message = '알림을 설정하지 못했어요. 기기의 알림 설정을 확인해 주세요.';
    }
    _notify();
    return success;
  }

  Future<void> visit() async {
    try {
      await _serial(() async {
        lastVisit = clock();
        await _persist();
        await _schedule();
      });
    } catch (_) {
      message = '알림 상태를 확인하지 못했어요. 설정에서 다시 확인해 주세요.';
    }
    _notify();
  }

  Future<void> pause() async {
    // Never retain the reason or conversation text. Explicit opt-in is needed to resume.
    _pauseRequested = true;
    _pauseVersion++;
    _setPaused();
    try {
      await _serial(() async {
        _setPaused();
        await _persist();
        await gateway.cancelAll();
      });
    } catch (_) {
      // Initialization/cancellation failure must not prevent persisting the pause.
      _setPaused();
      try {
        await _persist();
      } catch (_) {}
      try {
        await gateway.cancelAll();
      } catch (_) {}
    }
    _notify();
  }

  void _setPaused() {
    settings = ReminderSettings(
        startOn: settings.startOn,
        hour: settings.hour,
        minute: settings.minute,
        kind: settings.kind,
        gentle: settings.gentle,
        paused: true);
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
