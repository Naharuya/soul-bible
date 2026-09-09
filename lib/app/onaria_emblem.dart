import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'app_theme.dart';

/// Resolution-independent seven-path emblem inspired by the brand reference.
class OnariaEmblem extends StatelessWidget {
  const OnariaEmblem({super.key, this.size = 150});
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: '일곱 행성이 하나의 빛을 둘러싼 onaria 심볼',
    image: true,
    child: RepaintBoundary(child: CustomPaint(
      size: Size.square(size), painter: _EmblemPainter(AppTheme.of(context)),
    )),
  );
}

class _EmblemPainter extends CustomPainter {
  const _EmblemPainter(this.palette);
  final AppPalette palette;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 180, size.height / 180);
    const center = Offset(90, 88);
    final glow = Paint()..shader = RadialGradient(colors: [
      palette.green.withValues(alpha: .3), palette.green.withValues(alpha: 0),
    ]).createShader(Rect.fromCircle(center: center, radius: 74));
    canvas.drawCircle(center, 74, glow);
    final line = Paint()..color = palette.green.withValues(alpha: .65)
      ..style = PaintingStyle.stroke..strokeWidth = .8;
    canvas.drawOval(Rect.fromCenter(center: center, width: 120, height: 132), line);
    canvas.drawArc(Rect.fromCenter(center: const Offset(90, 87), width: 151, height: 146),
      .05, math.pi - .1, false, line..strokeWidth = 2);
    canvas.drawLine(const Offset(90, 8), const Offset(90, 171), line..strokeWidth = .6);
    const tones = [Color(0xFFF2CFA2), Color(0xFFA7C8E1), Color(0xFFF0CE8D),
      Color(0xFFE5B8AF), Color(0xFFB9B7E6), Color(0xFFCDD5AE), Color(0xFFA7D2D2)];
    void orb(Offset point, double radius, Color color) {
      canvas.drawCircle(point, radius + 7, Paint()..shader = RadialGradient(
        colors: [color.withValues(alpha: .35), color.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: point, radius: radius + 7)));
      canvas.drawCircle(point, radius, Paint()..shader = RadialGradient(
        center: const Alignment(-.4, -.5), colors: [const Color(0xFFFFF7E5), color, Color.lerp(color, palette.cream, .3)!],
      ).createShader(Rect.fromCircle(center: point, radius: radius)));
      canvas.drawCircle(point, radius, Paint()..color = Colors.white.withValues(alpha: .5)
        ..style = PaintingStyle.stroke..strokeWidth = .6);
    }
    orb(center, 20, palette.green);
    for (var i = 0; i < 7; i++) {
      final angle = -math.pi / 2 + i * 2 * math.pi / 7;
      orb(center + Offset(math.cos(angle) * 60, math.sin(angle) * 66), i == 0 ? 10 : 9, tones[i]);
    }
    final star = Paint()..color = const Color(0xFFFFE8BA);
    final path = Path()..moveTo(90, 150)..lineTo(92, 159)..lineTo(100, 161)
      ..lineTo(92, 163)..lineTo(90, 173)..lineTo(88, 163)..lineTo(80, 161)
      ..lineTo(88, 159)..close();
    canvas.drawPath(path, star);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _EmblemPainter oldDelegate) => oldDelegate.palette.scheme != palette.scheme;
}
