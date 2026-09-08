import 'package:flutter/material.dart';
import '../../app/space_scaffold.dart';
import '../engagement_controller.dart';
import '../domain_events.dart';
import 'reminder_controller.dart';

class NotificationSettingsPage extends StatefulWidget {
  const NotificationSettingsPage({super.key});
  @override
  State<NotificationSettingsPage> createState() => _NotificationSettingsPageState();
}
class _NotificationSettingsPageState extends State<NotificationSettingsPage> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) {
    final engagement = EngagementScope.of(context), controller = engagement.reminders;
    return ListenableBuilder(listenable: controller, builder: (context, _) {
      final settings = controller.settings;
      Future<void> update({bool? enabled, TimeOfDay? time, ReminderKind? kind, bool? gentle}) async {
        if (_busy) return;
        setState(() => _busy = true);
        final next = ReminderSettings(enabled: enabled ?? settings.enabled, hour: time?.hour ?? settings.hour,
          minute: time?.minute ?? settings.minute, kind: kind ?? settings.kind, gentle: gentle ?? settings.gentle,
          paused: enabled == true ? false : settings.paused);
        final success = await controller.configure(next);
        if (success && next.enabled && !settings.enabled) await engagement.track(EngagementMetric.notificationOptIn);
        if (mounted) setState(() => _busy = false);
      }
      return SpaceScaffold(appBar: AppBar(title: const Text('알림 설정')), body: ListView(padding: const EdgeInsets.all(20), children: [
        const Text('원할 때만, 조용히', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        const Text('알림을 켜지 않아도 모든 기능을 사용할 수 있어요. 대화나 개인 기록은 알림에 넣지 않아요.'),
        if (settings.paused) const Padding(padding: EdgeInsets.only(top: 16), child: Text('알림이 일시 중지되어 있어요. 원할 때 다시 켤 수 있어요.')),
        SwitchListTile(title: const Text('알림 사용'), value: settings.enabled && !settings.paused,
          onChanged: _busy ? null : (value) => update(enabled: value)),
        ListTile(title: const Text('알림 시간'), trailing: Text(TimeOfDay(hour: settings.hour, minute: settings.minute).format(context)),
          onTap: _busy ? null : () async {
            final time = await showTimePicker(context: context, initialTime: TimeOfDay(hour: settings.hour, minute: settings.minute));
            if (time != null && mounted) await update(time: time);
          }),
        const SizedBox(height: 12), const Text('매일 알림 종류', style: TextStyle(fontWeight: FontWeight.bold)),
        ...ReminderKind.values.where((kind) => kind != ReminderKind.gentle).map((kind) => ListTile(
          title: Text(kind.label), leading: Icon(settings.kind == kind ? Icons.radio_button_checked : Icons.radio_button_off),
          selected: settings.kind == kind, onTap: _busy ? null : () => update(kind: kind))),
        SwitchListTile(title: const Text('3일 미방문 시 부드러운 안부'),
          subtitle: const Text('한 번만 안부를 전해요. 기록은 사라지지 않아요.'), value: settings.gentle,
          onChanged: _busy ? null : (value) => update(gentle: value)),
        const SizedBox(height: 12), const Text('기기 절전 설정에 따라 선택한 시간보다 조금 늦게 올 수 있어요.'),
        if (controller.message != null) Padding(padding: const EdgeInsets.only(top: 16), child: Text(controller.message!, semanticsLabel: controller.message)),
        if (_busy) const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
      ]));
    });
  }
}
