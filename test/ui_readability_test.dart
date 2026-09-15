import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/features/check_in_page.dart';
import 'package:onaria/features/conversation_page.dart';
import 'package:onaria/onaria.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  Future<void> showLargeText(WidgetTester tester, Widget page) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(2)),
        child: child!,
      ),
      home: page,
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('large text check-in keeps emotion selection and start reachable',
      (tester) async {
    await showLargeText(tester, const CheckInPage());
    for (var i = 0;
        i < 15 && find.text('불안').hitTestable().evaluate().isEmpty;
        i++) {
      await tester.drag(find.byType(ListView), const Offset(0, -200));
      await tester.pumpAndSettle();
    }
    final grid = tester.widget<GridView>(find.byType(GridView));
    expect((grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount).crossAxisCount, 3);
    await tester.tap(find.text('불안'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('AI 마음대화 시작하기'));
    expect(
        tester
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'AI 마음대화 시작하기'))
            .onPressed,
        isNotNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('large text and keyboard leave room for chat and sending',
      (tester) async {
    for (final channel in [
      'flutter_tts',
      'plugin.csdcorp.com/speech_to_text'
    ]) {
      tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(MethodChannel(channel), (_) async => 1);
    }
    await showLargeText(
        tester, const ConversationPage(emotion: EmotionType.joy, intensity: 5));
    final send = find.byWidgetPredicate(
        (widget) => widget is IconButton && widget.tooltip == '보내기');
    await tester.enterText(find.byType(TextField), '테스트');
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    expect(tester.widget<IconButton>(send).onPressed, isNotNull);
    expect(tester.getSize(find.byType(ListView)).height, greaterThan(100));
    expect(tester.getBottomRight(send).dy, lessThanOrEqualTo(500));
    expect(tester.takeException(), isNull);
  });
}
