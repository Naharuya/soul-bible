import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as timezone_data;
import 'package:timezone/timezone.dart' as tz;
import 'reminder_controller.dart';

class NativeNotifications implements NotificationGateway {
  final _plugin = FlutterLocalNotificationsPlugin();
  bool get supported => !kIsWeb && [TargetPlatform.android, TargetPlatform.iOS].contains(defaultTargetPlatform);
  @override
  Future<void> initialize(void Function(ReminderKind kind) onTap) async {
    if (!supported) return;
    timezone_data.initializeTimeZones();
    final zone = await FlutterTimezone.getLocalTimezone();
    tz.setLocalLocation(tz.getLocation(zone.identifier));
    await _plugin.initialize(settings: const InitializationSettings(
      android: AndroidInitializationSettings('ic_notification'),
      iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
    ), onDidReceiveNotificationResponse: (response) {
      final kind = ReminderKind.fromPayload(response.payload); if (kind != null) onTap(kind);
    });
    final launch = await _plugin.getNotificationAppLaunchDetails();
    final kind = ReminderKind.fromPayload(launch?.notificationResponse?.payload);
    if (launch?.didNotificationLaunchApp == true && kind != null) onTap(kind);
  }
  @override
  Future<bool> hasPermission() async {
    if (!supported) return false;
    if (defaultTargetPlatform == TargetPlatform.android) {
      return await _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.areNotificationsEnabled() ?? false;
    }
    return (await _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.checkPermissions())?.isEnabled ?? false;
  }
  @override
  Future<bool> requestPermission() async {
    if (!supported) return false;
    if (defaultTargetPlatform == TargetPlatform.android) {
      return await _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission() ?? false;
    }
    return await _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.requestPermissions(alert: true, badge: false, sound: false) ?? false;
  }
  @override
  Future<void> cancelAll() async { if (supported) await _plugin.cancelAll(); }
  @override
  Future<void> schedule(PlannedReminder plan) async {
    if (!supported) throw UnsupportedError('Mobile notifications only');
    // Refresh IANA zone on each scheduling pass; calendar components respect DST.
    tz.setLocalLocation(tz.getLocation((await FlutterTimezone.getLocalTimezone()).identifier));
    final at = plan.at;
    await _plugin.zonedSchedule(id: plan.id, title: plan.title, body: plan.body,
      scheduledDate: tz.TZDateTime(tz.local, at.year, at.month, at.day, at.hour, at.minute),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails('soul_gentle_v1', '조용한 안부', channelDescription: '직접 선택한 시간의 중립적인 알림',
          importance: Importance.defaultImportance, priority: Priority.defaultPriority, playSound: false, enableVibration: false,
          visibility: NotificationVisibility.private, icon: 'ic_notification'),
        iOS: DarwinNotificationDetails(presentSound: false, presentBadge: false)),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: plan.repeats ? DateTimeComponents.time : null, payload: plan.payload);
  }
}
