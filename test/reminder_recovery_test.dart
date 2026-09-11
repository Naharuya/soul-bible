import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/notifications/reminder_controller.dart';
import 'support/engagement_fakes.dart';

void main() {
  test('tomorrow start survives reload and does not schedule again today', () async {
    final gateway = TestNotifications();
    final storage = MemoryEngagementStorage();
    final today = DateTime(2026, 12, 31, 10);
    final tomorrow = DateTime(2027, 1, 1);
    var controller = ReminderController(gateway: gateway, storage: storage, clock: () => today);
    await controller.configure(ReminderSettings(enabled: true, hour: 20, startOn: tomorrow));
    expect(gateway.plans.single.at, DateTime(2027, 1, 1, 20));
    controller.dispose();
    controller = ReminderController(gateway: gateway, storage: storage, clock: () => today);
    await controller.visit();
    expect(controller.settings.startOn, tomorrow);
    expect(gateway.plans.single.at, DateTime(2027, 1, 1, 20));
    final midnight = planReminders(ReminderSettings(enabled: true, hour: 0, startOn: tomorrow), today, today);
    expect(midnight.single.at, tomorrow);
    final following = planReminders(controller.settings, DateTime(2027, 1, 1, 21), today);
    expect(following.single.at, DateTime(2027, 1, 2, 20));
    controller.dispose();
  });
  test('pause survives failed initialization, retry and controller restart',
      () async {
    final storage = MemoryEngagementStorage();
    final gateway = TestNotifications();
    var controller = ReminderController(gateway: gateway, storage: storage);
    await controller.configure(const ReminderSettings(enabled: true));
    controller.dispose();
    gateway.failInitialization = true;
    controller = ReminderController(gateway: gateway, storage: storage);
    await controller.pause();
    expect(controller.settings.paused, isTrue);
    controller.dispose();
    gateway.failInitialization = false;
    controller = ReminderController(gateway: gateway, storage: storage);
    await controller.visit();
    expect(controller.settings.paused, isTrue);
    expect(gateway.plans, isEmpty);
    controller.dispose();
  });

  test('initialization failure can be retried without requesting permission',
      () async {
    final gateway = TestNotifications()..failInitialization = true;
    final controller = ReminderController(
        gateway: gateway, storage: MemoryEngagementStorage());
    await controller.visit();
    expect(controller.ready, isFalse);
    expect(controller.message, isNotNull);
    gateway.failInitialization = false;
    await controller.visit();
    expect(controller.ready, isTrue);
    expect(controller.message, isNull);
    expect(gateway.initializations, 2);
    expect(gateway.permissionRequests, 0);
    controller.dispose();
  });

  test(
      'opt-in schedules, pause cancels, restart stays paused until explicit opt-in',
      () async {
    final gateway = TestNotifications();
    final storage = MemoryEngagementStorage();
    var controller = ReminderController(gateway: gateway, storage: storage);
    expect(
        await controller
            .configure(const ReminderSettings(enabled: true, gentle: true)),
        isTrue);
    expect(gateway.plans.length, 2);
    await controller.pause();
    expect(gateway.plans, isEmpty);
    controller.dispose();
    controller = ReminderController(gateway: gateway, storage: storage);
    await controller.visit();
    expect(controller.settings.paused, isTrue);
    expect(gateway.plans, isEmpty);
    expect(await controller.configure(const ReminderSettings(enabled: true)),
        isTrue);
    expect(gateway.plans.length, 1);
    controller.dispose();
  });
}
