// Run with: flutter test script/export_launcher_icons.dart
// Reuses the app's vector emblem for Android launcher assets.
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/app_theme.dart';
import 'package:onaria/app/onaria_emblem.dart';

void main() {
  testWidgets('export Android launcher icons', (tester) async {
    for (final adaptive in [false, true]) {
      final key = GlobalKey();
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light,
        home: Center(child: RepaintBoundary(
          key: key,
          child: SizedBox.square(
            dimension: 432,
            child: ColoredBox(
              color: adaptive ? Colors.transparent : const Color(0xFF0B1023),
              child: Center(child: OnariaEmblem(size: adaptive ? 264 : 354)),
            ),
          ),
        )),
      ));
      await tester.pump();
      final boundary = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      await tester.runAsync(() async {
        for (final density in {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}.entries) {
          final pixels = (adaptive ? 108 : 48) * density.value;
          final image = await boundary.toImage(pixelRatio: pixels / 432);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          final name = adaptive ? 'ic_launcher_foreground' : 'ic_launcher';
          final file = File('android/app/src/main/res/mipmap-${density.key}/$name.png');
          await file.parent.create(recursive: true);
          await file.writeAsBytes(bytes!.buffer.asUint8List());
          image.dispose();
        }
      });
    }
  });
}
