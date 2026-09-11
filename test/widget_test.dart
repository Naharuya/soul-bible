// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import 'package:onaria/app/onaria_app.dart';
import 'package:onaria/app/social_auth_config.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
  });

  tearDown(() {
    SharedPreferencesAsyncPlatform.instance = null;
  });

  testWidgets('check-in page is available without social provider setup', (WidgetTester tester) async {
    await tester.pumpWidget(const OnariaApp());

    expect(find.text('오늘 마음은\n어떤가요?'), findsOneWidget);
    expect(find.text('onaria 시작하기'), findsNothing);
  });

  testWidgets('signup opens from the menu and back returns to check-in', (tester) async {
    await tester.pumpWidget(const OnariaApp());
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('메뉴'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('회원가입'));
    await tester.pumpAndSettle();
    expect(find.text('onaria 시작하기'), findsOneWidget);
    for (final link in ['https://api.onaria.ai.kr/app/open', 'onaria://app/open']) {
      await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
        'flutter/navigation',
        const JSONMethodCodec().encodeMethodCall(
            MethodCall('pushRouteInformation', {'location': link})),
        (_) {},
      );
      await tester.pumpAndSettle();
      expect(find.text('onaria 시작하기'), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('오늘 마음은\n어떤가요?'), findsOneWidget);
  });

  testWidgets('check-in page remains the first screen when providers are configured', (WidgetTester tester) async {
    await tester.pumpWidget(const OnariaApp(
      authConfig: SocialAuthConfig(
        naverClientId: 'test-naver',
        kakaoClientId: 'test-kakao',
        googleClientId: 'test-google',
      ),
    ));

    expect(find.text('오늘 마음은\n어떤가요?'), findsOneWidget);
  });

  testWidgets('development override opens the main check-in page', (WidgetTester tester) async {
    await tester.pumpWidget(const OnariaApp(
      authConfig: SocialAuthConfig(
        naverClientId: 'test-naver',
        kakaoClientId: 'test-kakao',
        googleClientId: 'test-google',
        developmentOverride: true,
      ),
    ));

    expect(find.text('오늘 마음은\n어떤가요?'), findsOneWidget);
  });
}
