import 'dart:async';
import 'package:flutter/material.dart';

import '../engagement/engagement_controller.dart';
import '../engagement/engagement_page.dart';
import '../engagement/notifications/reminder_controller.dart';
import '../features/check_in_page.dart';
import 'app_theme.dart';
import 'social_auth_config.dart';
import 'theme_controller.dart';

class OnariaApp extends StatefulWidget {
  const OnariaApp(
      {super.key, this.authConfig = const SocialAuthConfig(), this.engagement});

  final SocialAuthConfig authConfig;
  final EngagementController? engagement;

  @override
  State<OnariaApp> createState() => _OnariaAppState();
}

class _OnariaAppState extends State<OnariaApp> with WidgetsBindingObserver {
  final _theme = ThemeController();
  final _navigator = GlobalKey<NavigatorState>();
  late final _engagement = widget.engagement ?? EngagementController();

  @override
  void initState() {
    super.initState();
    _theme.load();
    WidgetsBinding.instance.addObserver(this);
    _engagement.reminders.onTap = _openReminder;
    unawaited(_engagement.load());
    unawaited(_engagement.visit());
  }

  void _openReminder(ReminderKind kind) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _engagement.reminders.settings.paused) return;
      final navigator = _navigator.currentState;
      if (kind == ReminderKind.checkin || kind == ReminderKind.gentle) {
        // Keep an ongoing conversation intact when returning from a reminder.
        if (navigator?.canPop() == true) return;
      } else {
        navigator?.push(MaterialPageRoute<void>(
            builder: (_) => EngagementPage(
                  savedOnly: kind == ReminderKind.savedVerses,
                )));
      }
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(_engagement.visit());
  }

  @override
  Future<bool> didPushRouteInformation(RouteInformation routeInformation) async {
    final uri = routeInformation.uri;
    // An invitation opens the app without replacing an ongoing conversation.
    return (uri.scheme == 'https' && uri.host == 'api.onaria.ai.kr' && uri.path == '/app/open') ||
        (uri.scheme == 'onaria' && uri.host == 'app' && uri.path == '/open') ||
        (uri.scheme.isEmpty && uri.path == '/app/open');
  }

  @override
  void dispose() {
    _theme.dispose();
    WidgetsBinding.instance.removeObserver(this);
    _engagement.reminders.onTap = null;
    if (widget.engagement == null) _engagement.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return EngagementScope(
        controller: _engagement,
        child: ValueListenableBuilder<ThemeColor>(
            valueListenable: _theme,
            builder: (context, color, child) => MaterialApp(
                  title: 'onaria',
                  navigatorKey: _navigator,
                  debugShowCheckedModeBanner: false,
                  theme: AppTheme.forColor(color),
                  home: const CheckInPage(),
                  initialRoute: '/',
                )));
  }
}
