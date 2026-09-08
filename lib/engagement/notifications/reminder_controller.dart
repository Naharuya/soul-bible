import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../storage.dart';
import 'native_notifications.dart';

enum ReminderKind {
  checkin('오늘의 마음 체크인', '오늘 마음은 어떠세요?'),
  todayVerse('오늘의 말씀', '잠시 쉬어 가는 시간을 가져보세요.'),
  savedVerses('저장한 말씀 다시 보기', '전에 저장한 말씀을 다시 만나볼까요?'),
  gentle('부드러운 안부', '잠시 마음을 돌아보는 시간을 가져보세요.');
  const ReminderKind(this.label, this.message);
  final String label, message;
  static ReminderKind? fromPayload(String? payload) => values.where((v) => payload == 'engagement:${v.name}').firstOrNull;
}

class ReminderSettings {
  const ReminderSettings({this.enabled = false, this.hour = 20, this.minute = 0,
    this.kind = ReminderKind.checkin, this.gentle = false, this.paused = false});
  final bool enabled, gentle, paused;
  final int hour, minute;
  final ReminderKind kind;
  Map<String, Object> toJson() => {'enabled': enabled, 'hour': hour, 'minute': minute, 'kind': kind.name, 'gentle': gentle, 'paused': paused};
  factory ReminderSettings.fromJson(Map<String, dynamic> map) {
    final hour = map['hour'] as int? ?? 20, minute = map['minute'] as int? ?? 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw const FormatException('Invalid reminder time');
    return ReminderSettings(enabled: map['enabled'] == true, hour: hour, minute: minute,
      kind: ReminderKind.values.where((v) => v.name == map['kind'] && v != ReminderKind.gentle).firstOrNull ?? ReminderKind.checkin,
      gentle: map['gentle'] == true, paused: map['paused'] == true);
  }
}

class PlannedReminder {
  const PlannedReminder({required this.id, required this.kind, required this.at, required this.repeats});
  final int id;
  final ReminderKind kind;
  final DateTime at;
  final bool repeats;
  String get title => '소울바이블';
  String get body => kind.message;
  String get payload => 'engagement:${kind.name}';
}

List<PlannedReminder> planReminders(ReminderSettings settings, DateTime now, DateTime lastVisit) {
  if (!settings.enabled || settings.paused) return [];
  if (settings.hour < 0 || settings.hour > 23 || settings.minute < 0 || settings.minute > 59) throw ArgumentError('Invalid time');
  DateTime after(DateTime threshold) {
    var result = DateTime(threshold.year, threshold.month, threshold.day, settings.hour, settings.minute);
    if (!result.isAfter(threshold)) result = DateTime(threshold.year, threshold.month, threshold.day + 1, settings.hour, settings.minute);
    return result;
  }
  final away = lastVisit.add(const Duration(hours: 72));
  return [PlannedReminder(id: 1001, kind: settings.kind, at: after(now), repeats: true),
    if (settings.gentle) PlannedReminder(id: 1002, kind: ReminderKind.gentle, at: after(away.isAfter(now) ? away : now), repeats: false)];
}

abstract interface class NotificationGateway {
  Future<void> initialize(void Function(ReminderKind kind) onTap);
  Future<bool> hasPermission();
  Future<bool> requestPermission();
  Future<void> cancelAll();
  Future<void> schedule(PlannedReminder plan);
}

class ReminderController extends ChangeNotifier {
  ReminderController({NotificationGateway? gateway, EngagementStorage? storage, DateTime Function()? clock})
    : gateway = gateway ?? NativeNotifications(), storage = storage ?? PreferencesEngagementStorage(), clock = clock ?? DateTime.now;
  static const storageKey = 'soul_bible.reminders.v1';
  final NotificationGateway gateway;
  final EngagementStorage storage;
  final DateTime Function() clock;
  ReminderSettings settings = const ReminderSettings();
  DateTime? lastVisit;
  void Function(ReminderKind kind)? onTap;
  String? message;
  bool _disposed = false;
  Future<void>? _loading;
  Future<void> _tail = Future.value();
  Future<void> load() => _loading ??= _load();
  Future<void> _load() async {
    final raw = await storage.read(storageKey);
    if (raw != null) {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      settings = ReminderSettings.fromJson(Map<String, dynamic>.from(data['settings'] as Map));
      lastVisit = DateTime.tryParse(data['lastVisit'] as String? ?? '');
    }
    await gateway.initialize((kind) { if (!_disposed) onTap?.call(kind); });
  }
  Future<void> _persist() => storage.write(storageKey, jsonEncode({'settings': settings.toJson(), 'lastVisit': lastVisit?.toIso8601String()}));
  Future<void> _serial(Future<void> Function() action) {
    final next = _tail.then((_) async { await load(); await action(); });
    _tail = next.catchError((Object _) {});
    return next;
  }
  void _notify() { if (!_disposed) notifyListeners(); }
  Future<void> _schedule() async {
    await gateway.cancelAll();
    if (!settings.enabled || settings.paused) return;
    if (!await gateway.hasPermission()) throw StateError('Permission denied');
    for (final plan in planReminders(settings, clock(), lastVisit ?? clock())) { await gateway.schedule(plan); }
  }
  Future<bool> configure(ReminderSettings requested) async {
    var success = false;
    try { await _serial(() async {
      await gateway.cancelAll();
      // Consent must come from this explicit settings action, never initialization/resume.
      if (requested.enabled && !await gateway.hasPermission() && !await gateway.requestPermission()) {
        settings = ReminderSettings(hour: requested.hour, minute: requested.minute, kind: requested.kind, gentle: requested.gentle);
        message = '알림 권한이 허용되지 않았어요. 알림 없이도 모든 기능을 사용할 수 있어요.';
        await _persist(); return;
      }
      settings = requested;
      await _schedule(); await _persist();
      message = requested.enabled ? '선택한 시간에 조용히 알려드릴게요.' : '알림을 껐어요.';
      success = true;
    }); } catch (_) {
      settings = ReminderSettings(hour: requested.hour, minute: requested.minute, kind: requested.kind, gentle: requested.gentle);
      try { await gateway.cancelAll(); await _persist(); } catch (_) { /* Retry cancellation on the next visit. */ }
      message = '알림을 설정하지 못했어요. 기기의 알림 설정을 확인해 주세요.';
    }
    _notify(); return success;
  }
  Future<void> visit() async {
    try { await _serial(() async { lastVisit = clock(); await _persist(); await _schedule(); }); }
    catch (_) { message = '알림 상태를 확인하지 못했어요. 설정에서 다시 확인해 주세요.'; }
    _notify();
  }
  Future<void> pause() async {
    // Never retain the reason or conversation text. Explicit opt-in is needed to resume.
    try { await _serial(() async {
      settings = ReminderSettings(hour: settings.hour, minute: settings.minute, kind: settings.kind, gentle: settings.gentle, paused: true);
      await gateway.cancelAll(); await _persist();
    }); } catch (_) { try { await gateway.cancelAll(); } catch (_) {} }
    _notify();
  }
  @override
  void dispose() { _disposed = true; super.dispose(); }
}
