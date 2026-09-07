import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

enum ThemeColor {
  forest('포레스트', Color(0xFF91D8AA), Color(0xFF0D1B14)),
  rose('로즈', Color(0xFFF3B0BC), Color(0xFF251417)),
  amber('앰버', Color(0xFFF0C477), Color(0xFF211A0F)),
  silver('실버', Color(0xFFD5D8DC), Color(0xFF17191B));

  const ThemeColor(this.label, this.accent, this.background);
  final String label;
  final Color accent;
  final Color background;
}

class AppPalette {
  const AppPalette(this.scheme);
  final ColorScheme scheme;
  Color get ink => scheme.onSurface;
  Color get green => scheme.primary;
  Color get sage => scheme.primaryContainer;
  Color get cream => scheme.surface;
  Color get coral => scheme.error;
  Color get gold => scheme.secondary;
  Color get muted => scheme.onSurfaceVariant;
  Color get subtle => scheme.onSurfaceVariant;
  Color get border => scheme.outlineVariant;
  Color get panel => scheme.surfaceContainer;
  Color get accentFill => scheme.inversePrimary;
}

class AppTheme {
  static const radius = 20.0;
  static AppPalette of(BuildContext context) =>
      AppPalette(Theme.of(context).colorScheme);
  static ThemeData get light => forColor(ThemeColor.forest);
  static ThemeData get cosmic => light;

  static ThemeData forColor(ThemeColor color) {
    Color blend(double opacity) => Color.alphaBlend(
        color.accent.withValues(alpha: opacity), color.background);
    final scheme = ColorScheme.fromSeed(
            seedColor: color.accent, brightness: Brightness.dark)
        .copyWith(
      primary: color.accent,
      onPrimary: color.background,
      primaryContainer: blend(0.20),
      onPrimaryContainer: const Color(0xFFF7F7F2),
      secondary: color.accent,
      onSecondary: color.background,
      surface: color.background,
      surfaceContainer: blend(0.06),
      surfaceContainerLow: blend(0.04),
      surfaceContainerHigh: blend(0.10),
      surfaceContainerHighest: blend(0.14),
      onSurface: const Color(0xFFF7F7F2),
      onSurfaceVariant: Color.lerp(color.accent, Colors.white, 0.55),
      outlineVariant: blend(0.30),
      inversePrimary: Color.lerp(color.background, color.accent, 0.35),
    );
    final shape =
        RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius));
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      fontFamily: 'sans-serif',
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle.light,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainer,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(radius)),
        enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(radius),
            borderSide: BorderSide(color: scheme.outlineVariant)),
        focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(radius),
            borderSide: BorderSide(color: scheme.primary, width: 2)),
      ),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(54),
        shape: shape,
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
      )),
      cardTheme: CardThemeData(
        color: scheme.surfaceContainer,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: shape.copyWith(side: BorderSide(color: scheme.outlineVariant)),
      ),
    );
  }
}
