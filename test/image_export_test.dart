import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'package:onaria/engagement/sharing/native_share.dart';
import 'package:onaria/engagement/sharing/share_card.dart';
import 'package:onaria/engagement/sharing/share_preview_page.dart';
import 'support/engagement_fakes.dart';

class _Renderer extends ShareCardRenderer {
  _Renderer(this.image);
  final Future<Uint8List> image;
  @override
  Future<Uint8List> render(ShareCardContent content) => image;
}

class _Gateway implements CardShareGateway {
  bool saved = true;
  bool fail = false;
  Uint8List? received;
  int calls = 0;
  @override
  Future<bool> save(Uint8List png) async {
    calls++;
    received = png;
    if (fail) throw PlatformException(code: 'export_failed');
    return saved;
  }

  @override
  Future<CardShareResult> share(Uint8List png, Rect origin) async =>
      CardShareResult.dismissed;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('soul_bible/image_export');
  tearDown(() => TestDefaultBinaryMessengerBinding
      .instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, null));

  test(
      'native channel forwards PNG and distinguishes save, cancellation and failure',
      () async {
    final png = Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10]);
    Object result = true;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'saveImage');
      expect(call.arguments, png);
      if (result is PlatformException) throw result;
      return result;
    });
    final gateway = NativeCardShare();
    expect(await gateway.save(png), isTrue);
    result = false;
    expect(await gateway.save(png), isFalse);
    result = PlatformException(code: 'export_failed');
    await expectLater(gateway.save(png), throwsA(isA<PlatformException>()));
  });

  testWidgets(
      'export saves the preview bytes, allows retry and never increments sharing metrics',
      (tester) async {
    final gateway = _Gateway();
    final controller = testEngagement(
        storage: MemoryEngagementStorage(), clock: () => DateTime(2026, 9, 11));
    addTearDown(controller.dispose);
    await controller.load();
    final content = ShareCardContent.prayer();
    final bytes =
        (await tester.runAsync(() => ShareCardRenderer().render(content)))!;
    await tester.pumpWidget(EngagementScope(
        controller: controller,
        child: MaterialApp(
            home: SharePreviewPage(
                content: content,
                gateway: gateway,
                renderer: _Renderer(Future.value(bytes))))));
    await tester.pumpAndSettle();
    final preview =
        tester.widget<Image>(find.byKey(const ValueKey('share-card-preview')));
    expect((preview.image as MemoryImage).bytes, bytes);
    await tester.ensureVisible(find.text('이미지 파일 저장'));
    for (final mode in ['cancel', 'fail', 'save']) {
      gateway.saved = mode == 'save';
      gateway.fail = mode == 'fail';
      await tester.tap(find.text('이미지 파일 저장'));
      await tester.pumpAndSettle();
      expect(gateway.received, bytes);
      expect(controller.metrics, isEmpty);
      expect(
          find.text(switch (mode) {
            'save' => '이미지를 저장했어요.',
            'cancel' => '취소했어요. 언제든 다시 나눌 수 있어요.',
            _ => '이미지를 저장하지 못했어요. 저장 위치를 확인하고 다시 시도해 주세요.',
          }),
          findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
    }
    expect(gateway.calls, 3);
  });

  testWidgets(
      'leaving before rendering completes does not open a native save dialog',
      (tester) async {
    final gateway = _Gateway();
    final pending = Completer<Uint8List>();
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
        MaterialApp(navigatorKey: navigator, home: const Scaffold()));
    navigator.currentState!.push(MaterialPageRoute<void>(
        builder: (_) => SharePreviewPage(
            content: ShareCardContent.prayer(),
            gateway: gateway,
            renderer: _Renderer(pending.future))));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await tester.drag(find.byType(ListView), const Offset(0, -350));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('이미지 파일 저장'));
    await tester.pump();
    expect(
        tester
            .widget<OutlinedButton>(
                find.widgetWithText(OutlinedButton, '이미지 파일 저장'))
            .onPressed,
        isNull);
    navigator.currentState!.pop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    pending.complete(Uint8List(0));
    await tester.pumpAndSettle();
    expect(gateway.calls, 0);
    expect(tester.takeException(), isNull);
  });
}
