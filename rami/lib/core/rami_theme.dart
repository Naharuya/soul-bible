import 'package:flutter/material.dart';

class RamiTheme {
  static const background = Color(0xFFFFFBF4);
  static const ink = Color(0xFF2D3138);
  static const primary = Color(0xFFF6B94A);
  static const mint = Color(0xFFBFE7D5);
  static const sky = Color(0xFFCDE8FF);

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: background,
        colorScheme: ColorScheme.fromSeed(seedColor: primary),
        textTheme: const TextTheme(
          headlineMedium: TextStyle(
            fontWeight: FontWeight.w800,
            color: ink,
            height: 1.2,
          ),
          titleLarge: TextStyle(
            fontWeight: FontWeight.w800,
            color: ink,
          ),
          bodyLarge: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: ink,
          ),
        ),
      );
}
