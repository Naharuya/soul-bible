import 'package:onaria/app/app_theme.dart';
import 'package:onaria/app/onaria_app.dart';
import 'package:onaria/app/theme_controller.dart';
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

  testWidgets('launches rotate all eight themes from Onaria and wrap without a picker',
      (tester) async {
    expect(ThemeColor.values, hasLength(8));
    for (final color in [...ThemeColor.values, ThemeColor.onaria]) {
      await tester.pumpWidget(const OnariaApp());
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

  test('unknown saved theme starts with Onaria', () async {
    await SharedPreferencesAsync()
        .setString(ThemeController.storageKey, 'removed-theme');
    final controller = ThemeController();
    await controller.load();
    expect(controller.value, ThemeColor.onaria);
    controller.dispose();
  });
}
