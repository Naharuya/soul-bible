import 'package:flutter/material.dart';

import '../features/check_in_page.dart';
import 'app_theme.dart';
import 'social_auth_config.dart';
import 'theme_controller.dart';

class SoulBibleApp extends StatefulWidget {
  const SoulBibleApp({super.key, this.authConfig = const SocialAuthConfig()});

  final SocialAuthConfig authConfig;

  @override
  State<SoulBibleApp> createState() => _SoulBibleAppState();
}

class _SoulBibleAppState extends State<SoulBibleApp> {
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
              title: '소울바이블',
              debugShowCheckedModeBanner: false,
              theme: AppTheme.forColor(color),
              home: const CheckInPage(),
            ));
  }
}
