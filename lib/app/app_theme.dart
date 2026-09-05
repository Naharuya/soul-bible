import 'package:flutter/material.dart';

class AppTheme {
  static const ink = Color(0xFF1F2D3D);
  static const green = Color(0xFF466B62);
  static const sage = Color(0xFFDCE6DF);
  static const cream = Color(0xFFF6F1E8);
  static const coral = Color(0xFFA96F5F);
  static const gold = Color(0xFFB18A4A);
  static const muted = Color(0xFF66716F);
  static const subtle = Color(0xFF89908B);
  static const border = Color(0xFFE2D8C8);
  static const panel = Color(0xFFFBF8F1);
  static const radius = 12.0;

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: ink,
      brightness: Brightness.light,
      surface: cream,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme.copyWith(
        primary: green,
        secondary: gold,
        tertiary: coral,
        surface: cream,
        onSurface: ink,
        outline: border,
      ),
      scaffoldBackgroundColor: cream,
      fontFamily: 'serif',
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: ink,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(fontFamily: 'serif', color: ink, fontSize: 20, fontWeight: FontWeight.w700),
      ),
      textTheme: const TextTheme(
        headlineMedium: TextStyle(fontFamily: 'serif', color: ink, fontWeight: FontWeight.w700, height: 1.15),
        titleLarge: TextStyle(fontFamily: 'serif', color: ink, fontWeight: FontWeight.w700),
        bodyLarge: TextStyle(fontFamily: 'serif', color: ink, height: 1.5),
        bodyMedium: TextStyle(fontFamily: 'serif', color: ink, height: 1.45),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radius),
          borderSide: const BorderSide(color: border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius)),
          backgroundColor: green,
          foregroundColor: Colors.white,
          textStyle: const TextStyle(fontFamily: 'serif', fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius), side: const BorderSide(color: border)),
      ),
    );
  }
}
