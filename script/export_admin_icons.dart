// Run with: flutter test script/export_admin_icons.dart
// Other platforms: add --dart-define=ONARIA_ICON_FONT=/path/to/font.ttf
// Renders the existing onaria vector emblem into the admin PWA icon assets.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/app/onaria_emblem.dart';

void main() {
  testWidgets('export onaria admin icons', (tester) async {
    await tester.runAsync(() async {
      const fontPath = String.fromEnvironment('ONARIA_ICON_FONT',
          defaultValue: 'C:/Windows/Fonts/arial.ttf');
      final font = FontLoader('OnariaIcon');
      font.addFont(File(fontPath).readAsBytes().then((bytes) => ByteData.sublistView(bytes)));
      await font.load();
    });
    final key = GlobalKey();
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: Center(child: RepaintBoundary(key: key, child: SizedBox.square(
        dimension: 512,
        child: ColoredBox(color: const Color(0xFF0B1023), child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: const [
            OnariaEmblem(size: 230),
            Text('onaria', style: TextStyle(fontFamily: 'OnariaIcon', fontSize: 66, letterSpacing: 6,
                color: Color(0xFFF1D4A6), decoration: TextDecoration.none)),
            SizedBox(height: 16),
            Text('ADMIN', style: TextStyle(fontFamily: 'OnariaIcon', fontSize: 20, letterSpacing: 5,
                color: Color(0xFFB9B0E5), decoration: TextDecoration.none)),
          ],
        )),
      ))),
    ));
    await tester.pump();
    final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    await tester.runAsync(() async {
      for (final entry in {'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable.png': 512}.entries) {
        final image = await boundary.toImage(pixelRatio: entry.value / 512);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File('backend/public/icons/${entry.key}').writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      }
    });
  });
}
