import 'package:bible_mind_core/app/app_theme.dart';
import 'package:bible_mind_core/app/soul_bible_app.dart';
import 'package:bible_mind_core/app/theme_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });
  tearDown(() {
    SharedPreferencesAsyncPlatform.instance = null;
  });

  testWidgets('launches rotate all four themes and wrap without a picker',
      (tester) async {
    for (final color in [...ThemeColor.values, ThemeColor.forest]) {
      await tester.pumpWidget(const SoulBibleApp());
      await tester.pumpAndSettle();
      final theme = tester.widget<MaterialApp>(find.byType(MaterialApp)).theme!;
      expect(theme.colorScheme.primary, color.accent);
      expect(theme.colorScheme.surface, color.background);
      expect(find.byIcon(Icons.palette_outlined), findsNothing);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    }
  });

  test('an existing manual choice advances only once during this launch',
      () async {
    await SharedPreferencesAsync()
        .setString(ThemeController.storageKey, ThemeColor.rose.name);
    final controller = ThemeController();
    await Future.wait([controller.load(), controller.load()]);
    expect(controller.value, ThemeColor.amber);
    await controller.load();
    expect(controller.value, ThemeColor.amber);
    final nextLaunch = ThemeController();
    await nextLaunch.load();
    expect(nextLaunch.value, ThemeColor.silver);
    nextLaunch.dispose();
    controller.dispose();
  });

  test('unknown saved theme starts with forest', () async {
    await SharedPreferencesAsync()
        .setString(ThemeController.storageKey, 'removed-theme');
    final controller = ThemeController();
    await controller.load();
    expect(controller.value, ThemeColor.forest);
    controller.dispose();
  });
}
