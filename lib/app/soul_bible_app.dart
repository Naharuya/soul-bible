import 'package:flutter/material.dart';

import '../features/check_in_page.dart';
import 'app_theme.dart';
import 'social_auth_config.dart';

class SoulBibleApp extends StatelessWidget {
  const SoulBibleApp({super.key, this.authConfig = const SocialAuthConfig()});

  final SocialAuthConfig authConfig;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '소울바이블',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const CheckInPage(),
    );
  }
}
