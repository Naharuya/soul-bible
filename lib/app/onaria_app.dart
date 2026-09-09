import 'package:flutter/material.dart';

import '../features/check_in_page.dart';
import 'app_theme.dart';
import 'social_auth_config.dart';
import 'theme_controller.dart';

class OnariaApp extends StatefulWidget {
  const OnariaApp({super.key, this.authConfig = const SocialAuthConfig()});

  final SocialAuthConfig authConfig;

  @override
  State<OnariaApp> createState() => _OnariaAppState();
}

class _OnariaAppState extends State<OnariaApp> {
  final _theme = ThemeController();

  @override
  void initState() {
    super.initState();
    _theme.load();
  }

  @override
  void dispose() {
    _theme.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeColor>(
        valueListenable: _theme,
        builder: (context, color, child) => MaterialApp(
              title: 'onaria',
              debugShowCheckedModeBanner: false,
              theme: AppTheme.forColor(color),
              home: const CheckInPage(),
            ));
  }
}
