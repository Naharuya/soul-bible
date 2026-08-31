import 'package:flutter/material.dart';

import '../features/check_in_page.dart';
import 'app_theme.dart';

class SoulBibleApp extends StatelessWidget {
  const SoulBibleApp({super.key});

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
