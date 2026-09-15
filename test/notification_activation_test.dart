import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/notifications/notification_settings_page.dart';
import 'support/engagement_fakes.dart';

class _PermissionGateway extends TestNotifications {
  bool allow = true;
  @override
  Future<bool> requestPermission() async {
    permissionRequests++;
    granted = allow;
    return granted;
  }
}

void main() {
  for (final gentle in [false, true]) {
  for (final allow in [true, false]) {
    testWidgets('notification switch retries initialization and requests permission: allow=$allow gentle=$gentle', (tester) async {
      final gateway = _PermissionGateway()
        ..granted = false
        ..failInitialization = true
        ..allow = allow;
      final engagement = testEngagement(storage: MemoryEngagementStorage(), clock: () => DateTime(2026, 9, 12, 12), notifications: gateway);
      addTearDown(engagement.dispose);
      await engagement.visit();
      expect(engagement.reminders.ready, isFalse);
      expect(gateway.permissionRequests, 0);
      await tester.pumpWidget(EngagementScope(controller: engagement,
        child: const MaterialApp(home: NotificationSettingsPage())));
      await tester.pumpAndSettle();
      final toggle = find.widgetWithText(SwitchListTile, gentle ? '3일 미방문 시 부드러운 안부' : '알림 사용');
      expect(tester.widget<SwitchListTile>(toggle).onChanged, isNotNull);
      gateway.failInitialization = false;
      await tester.ensureVisible(toggle);
      await tester.pumpAndSettle();
      await tester.tap(toggle);
      await tester.pumpAndSettle();
      expect(gateway.permissionRequests, 1);
      expect(engagement.reminders.ready, isTrue);
      expect(tester.widget<SwitchListTile>(toggle).value, allow);
      expect(gateway.plans.length, allow ? (gentle ? 2 : 1) : 0);
      if (allow && gentle) {
        final reminder = gateway.plans.singleWhere((plan) => plan.id == 1002);
        expect(reminder.repeats, isFalse);
        expect(reminder.at, DateTime(2026, 9, 15, 20));
        await tester.tap(toggle);
        await tester.pumpAndSettle();
        expect(tester.widget<SwitchListTile>(toggle).value, isFalse);
        expect(gateway.plans.single.id, 1001);
      }
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  }
}
