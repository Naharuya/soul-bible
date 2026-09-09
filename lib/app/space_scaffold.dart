import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'app_theme.dart';

/// A static star field keeps the atmosphere quiet and avoids animation overhead.
class SpaceScaffold extends StatelessWidget {
  const SpaceScaffold({super.key, this.appBar, required this.body});

  final PreferredSizeWidget? appBar;
  final Widget body;

  @override
  Widget build(BuildContext context) => Stack(
        children: [
          Positioned.fill(
            child: RepaintBoundary(
                child:
                    CustomPaint(painter: _SpacePainter(AppTheme.of(context)))),
          ),
          Scaffold(
            backgroundColor: Colors.transparent,
            appBar: appBar,
            body: body,
          ),
        ],
      );
}

class _SpacePainter extends CustomPainter {
  const _SpacePainter(this.palette);
  final AppPalette palette;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = palette.cream);
    canvas.drawRect(
        rect,
        Paint()
          ..shader = RadialGradient(
            center: const Alignment(0.9, -0.8),
            radius: 1.2,
            colors: [palette.sage, palette.cream.withValues(alpha: 0)],
          ).createShader(rect));
    canvas.drawRect(
        rect,
        Paint()
          ..shader = RadialGradient(
            center: Alignment(-1, 0.6),
            radius: 0.9,
            colors: [
              palette.green.withValues(alpha: 0.12),
              palette.green.withValues(alpha: 0)
            ],
          ).createShader(rect));
    final random = math.Random(27);
    // Fine stars and a lavender nebula echo the reference without bitmap scaling.
    canvas.drawRect(rect, Paint()..shader = RadialGradient(
      center: const Alignment(.65, -.35), radius: .85,
      colors: [palette.gold.withValues(alpha: .13), palette.cream.withValues(alpha: 0)],
    ).createShader(rect));
    for (var i = 0; i < 180; i++) {
      final point = Offset(
          random.nextDouble() * size.width, random.nextDouble() * size.height);
      final radius = i % 9 == 0 ? 1.5 : 0.65;
      final paint = Paint()
        ..color =
            palette.ink.withValues(alpha: 0.15 + random.nextDouble() * 0.35);
      canvas.drawCircle(point, radius, paint);
      if (i % 19 == 0) {
        canvas.drawLine(point - const Offset(3, 0), point + const Offset(3, 0),
            paint..strokeWidth = 0.6);
        canvas.drawLine(
            point - const Offset(0, 3), point + const Offset(0, 3), paint);
      }
    }
    canvas.save();
    canvas.translate(size.width * 0.9, size.height * 0.18);
    canvas.rotate(-0.5);
    canvas.drawOval(
        Rect.fromCenter(center: Offset.zero, width: 240, height: 90),
        Paint()
          ..color = palette.green.withValues(alpha: 0.16)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1);
    canvas.restore();
    final horizon = Rect.fromLTWH(-size.width * .35, size.height * .92,
        size.width * 1.7, size.height * .45);
    canvas.drawOval(horizon, Paint()..shader = LinearGradient(
      begin: Alignment.topCenter, end: Alignment.bottomCenter,
      colors: [palette.gold.withValues(alpha: .14), palette.cream],
    ).createShader(horizon));
    canvas.drawOval(horizon, Paint()..color = palette.green.withValues(alpha: .22)
      ..style = PaintingStyle.stroke..strokeWidth = 1.2);
  }

  @override
  bool shouldRepaint(covariant _SpacePainter oldDelegate) =>
      oldDelegate.palette.scheme != palette.scheme;
}
