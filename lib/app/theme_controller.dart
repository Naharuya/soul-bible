import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_theme.dart';

/// Advances once per app launch, never on rebuilds or background resumes.
class ThemeController extends ValueNotifier<ThemeColor> {
  ThemeController() : super(ThemeColor.forest);
  static const storageKey = 'appearance_theme';
  final _preferences = SharedPreferencesAsync();
  bool _disposed = false;
  Future<void>? _launch;

  Future<void> load() => _launch ??= _advance();

  Future<void> _advance() async {
    try {
      final saved = await _preferences.getString(storageKey);
      if (_disposed) return;
      final index =
          ThemeColor.values.indexWhere((theme) => theme.name == saved);
      value = ThemeColor.values[(index + 1) % ThemeColor.values.length];
      await _preferences.setString(storageKey, value.name);
    } catch (_) {
      // Preference failures must not prevent opening the app.
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
