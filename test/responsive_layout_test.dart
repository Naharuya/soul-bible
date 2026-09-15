import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/app/mind_card_store.dart';
import 'package:onaria/app/responsive_text.dart';
import 'package:onaria/app/space_scaffold.dart';
import 'package:onaria/features/growth_page.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

void main() {
  setUp(() => SharedPreferencesAsyncPlatform.instance =
      InMemorySharedPreferencesAsync.empty());
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);
  for (final width in [320.0, 360.0, 390.0, 430.0, 768.0]) {
    for (final scale in [1.0, 1.3, 2.0]) {
      testWidgets('responsive phrase fits words: width=$width scale=$scale',
          (tester) async {
        tester.view.physicalSize = Size(width, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(MaterialApp(
            theme: AppTheme.light,
            builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context)
                    .copyWith(textScaler: TextScaler.linear(scale)),
                child: child!),
            home: const SpaceScaffold(
                body: Padding(
                    padding: EdgeInsets.all(20),
                    child: ResponsiveText('모든 마음은 저마다의 길이 있습니다.',
                        preferredWrap: '모든 마음은\n저마다의 길이 있습니다.',
                        minFontSize: 13,
                        maxFontSize: 16)))));
        await tester.pumpAndSettle();
        final finder = find.descendant(
            of: find.byType(ResponsiveText), matching: find.byType(Text));
        final label = tester.widget<Text>(finder);
        expect(label.data!.replaceAll('\n', ' '), '모든 마음은 저마다의 길이 있습니다.');
        expect(label.data, isNot(contains('\n다.')));
        expect(label.style!.fontSize, inInclusiveRange(13, 16));
        final paragraph = tester.renderObject<RenderParagraph>(finder);
        for (final line in label.data!.split('\n')) {
          final painter = TextPainter(
              text: TextSpan(text: line, style: label.style),
              textDirection: TextDirection.ltr,
              textScaler: TextScaler.linear(scale))
            ..layout();
          expect(painter.width, lessThanOrEqualTo(paragraph.size.width + 0.5));
          painter.dispose();
        }
        expect(tester.takeException(), isNull);
      });
    }
  }
  for (final scale in [1.0, 2.0]) {
    testWidgets(
        'growth finish stays visible above navigation bar while scrolling: $scale',
        (tester) async {
      tester.view.physicalSize = const Size(360, 780);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final store = MindCardStore();
      for (var i = 0; i < 12; i++) {
        await store.save(MindCardRecord(
            id: '$i',
            createdAt: DateTime.now(),
            title: '카드',
            dateLabel: '오늘',
            emotion: '기쁨',
            intensity: 5,
            verseReference: '시편 23:1',
            verseText: '',
            reflectionQuestion: '',
            action: '현재 상황을 차분하게 정리해보기',
            closingMessage: ''));
      }
      await tester.pumpWidget(MaterialApp(
          theme: AppTheme.light,
          builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                  padding: const EdgeInsets.only(top: 24, bottom: 34),
                  viewPadding: const EdgeInsets.only(top: 24, bottom: 34),
                  textScaler: TextScaler.linear(scale)),
              child: child!),
          home: GrowthPage(store: store)));
      await tester.pumpAndSettle();
      final finish = find.byKey(const ValueKey('growth-finish'));
      final initial = tester.getRect(finish);
      expect(initial.bottom, lessThanOrEqualTo(780 - 34));
      expect(finish.hitTestable(), findsOneWidget);
      await tester.drag(find.byType(ListView).first, const Offset(0, -1200));
      await tester.pumpAndSettle();
      expect(tester.getRect(finish), initial);
      expect(finish.hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
