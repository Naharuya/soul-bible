import 'dart:math' as math;
import 'package:flutter/material.dart';

import 'cross_light_game.dart';

/// Calm tap-based cross-light board.
///
/// All six stars remain visible, but only the next uncollected star is the
/// active target. The active target alone pulses while the game is ready.
/// Collected stars move into the cross in order.
class CrossLightSky extends StatefulWidget {
  const CrossLightSky({
    super.key,
    required this.pieces,
    required this.ready,
    this.paused = false,
    required this.onCollect,
  });

  final Set<String> pieces;
  final bool ready;
  final bool paused;
  final ValueChanged<String> onCollect;

  @override
  State<CrossLightSky> createState() => _CrossLightSkyState();
}

class _CrossLightSkyState extends State<CrossLightSky> {
  static const _scattered = [
    Offset(0.18, 0.14),
    Offset(0.82, 0.12),
    Offset(0.18, 0.48),
    Offset(0.82, 0.46),
    Offset(0.18, 0.86),
    Offset(0.82, 0.84),
  ];

  static const _cross = [
    Offset(0.5, 0.10),
    Offset(0.25, 0.36),
    Offset(0.5, 0.36),
    Offset(0.75, 0.36),
    Offset(0.5, 0.62),
    Offset(0.5, 0.88),
  ];

  int get _activeIndex =>
      widget.pieces.length.clamp(0, crossLightWords.length - 1);

  @override
  Widget build(BuildContext context) {
    const lightColor = Color(0xFFFFE3A0);
    final reduced = MediaQuery.disableAnimationsOf(context);
    final moveDuration =
        reduced ? Duration.zero : const Duration(milliseconds: 850);

    return LayoutBuilder(builder: (context, constraints) {
      final width = constraints.maxWidth.clamp(48.0, 340.0);
      const height = 300.0;

      Offset position(Offset point) =>
          Offset(point.dx * (width - 48), point.dy * (height - 48));

      final targets = _cross
          .map((point) => position(point) + const Offset(24, 24))
          .toList();

      return Center(
        child: SizedBox(
          width: width,
          height: height,
          child: Stack(
            children: [
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    gradient: const RadialGradient(
                      colors: [Color(0xFF24354C), Color(0xFF0A1020)],
                      radius: .9,
                    ),
                  ),
                ),
              ),
              Positioned.fill(
                child: IgnorePointer(
                  child: CustomPaint(
                    painter: _DustPainter(const Color(0xFFB9C8E2)),
                  ),
                ),
              ),
              Positioned.fill(
                child: IgnorePointer(
                  child: AnimatedOpacity(
                    key: const ValueKey('cross-quiet-glow'),
                    opacity:
                        widget.pieces.length == crossLightWords.length ? 1 : 0,
                    duration: moveDuration,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          colors: [
                            lightColor.withValues(alpha: .14),
                            lightColor.withValues(alpha: 0),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Positioned.fill(
                child: IgnorePointer(
                  child: AnimatedOpacity(
                    opacity:
                        widget.pieces.length == crossLightWords.length ? 1 : 0,
                    duration: moveDuration,
                    child: CustomPaint(
                      key: const ValueKey('cross-starlight-lines'),
                      painter: _CrossLinesPainter(targets, lightColor),
                    ),
                  ),
                ),
              ),
              for (final entry in crossLightWords.entries.indexed)
                AnimatedPositioned(
                  key: ValueKey('cross-piece-${entry.$2.key}'),
                  duration: moveDuration,
                  curve: Curves.easeInOutCubic,
                  left: position(widget.pieces.contains(entry.$2.key)
                          ? _cross[entry.$1]
                          : _scattered[entry.$1])
                      .dx,
                  top: position(widget.pieces.contains(entry.$2.key)
                          ? _cross[entry.$1]
                          : _scattered[entry.$1])
                      .dy,
                  width: 48,
                  height: 48,
                  child: _DriftingLight(
                    collected: widget.pieces.contains(entry.$2.key),
                    paused: widget.paused,
                    phase: entry.$1 * math.pi / 3,
                    horizontalTravel: math.min(28, (width - 48) * .12),
                    child: _StarTarget(
                      key: ValueKey('cross-light-touch-${entry.$2.key}'),
                      word: entry.$2.key,
                      label: entry.$2.value,
                      collected: widget.pieces.contains(entry.$2.key),
                      active: entry.$1 == _activeIndex &&
                          !widget.pieces.contains(entry.$2.key),
                      ready: widget.ready && !widget.paused,
                      reducedMotion: reduced,
                      onCollect: widget.onCollect,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    });
  }
}

class _StarTarget extends StatefulWidget {
  const _StarTarget({
    super.key,
    required this.word,
    required this.label,
    required this.collected,
    required this.active,
    required this.ready,
    required this.reducedMotion,
    required this.onCollect,
  });

  final String word;
  final String label;
  final bool collected;
  final bool active;
  final bool ready;
  final bool reducedMotion;
  final ValueChanged<String> onCollect;

  @override
  State<_StarTarget> createState() => _StarTargetState();
}

class _StarTargetState extends State<_StarTarget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void initState() {
    super.initState();
    _syncPulse();
  }

  @override
  void didUpdateWidget(covariant _StarTarget oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncPulse();
  }

  void _syncPulse() {
    final shouldPulse = widget.active && widget.ready && !widget.reducedMotion;
    if (shouldPulse) {
      if (!_pulse.isAnimating) _pulse.repeat(reverse: true);
    } else {
      _pulse.stop();
      _pulse.value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const lightColor = Color(0xFFFFE3A0);
    final enabled = widget.active && widget.ready && !widget.collected;

    return Semantics(
      label: '${widget.label}의 빛',
      hint: enabled ? '지금 반짝이는 별을 터치하세요.' : null,
      button: enabled,
      enabled: enabled,
      selected: widget.collected,
      onTap: enabled ? () => widget.onCollect(widget.word) : null,
      child: Tooltip(
        message: widget.label,
        excludeFromSemantics: true,
        child: InkResponse(
          onTap: enabled ? () => widget.onCollect(widget.word) : null,
          radius: 24,
          containedInkWell: true,
          excludeFromSemantics: true,
          child: ExcludeSemantics(
            child: AnimatedBuilder(
              animation: _pulse,
              builder: (context, child) {
                final t = _pulse.value;
                final scale = enabled ? 1 + (0.18 * t) : 1.0;
                final opacity = widget.collected
                    ? 1.0
                    : widget.active
                        ? (widget.ready ? 1.0 : .58)
                        : .32;
                return Transform.scale(
                  scale: scale,
                  child: Opacity(
                    opacity: opacity,
                    child: Container(
                      decoration: enabled
                          ? BoxDecoration(
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: lightColor.withValues(
                                      alpha: .20 + .30 * t),
                                  blurRadius: 12 + 14 * t,
                                  spreadRadius: 1 + 3 * t,
                                ),
                              ],
                            )
                          : null,
                      alignment: Alignment.center,
                      child: Text(
                        widget.collected || widget.active ? '✦' : '✧',
                        textScaler: TextScaler.noScaling,
                        style: TextStyle(
                          fontSize: widget.collected ? 28 : 25,
                          color: lightColor,
                          shadows: [
                            Shadow(
                              color: lightColor.withValues(
                                  alpha: enabled ? .65 : .20),
                              blurRadius: enabled ? 14 : 6,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// The star and its 48px touch target drift together until collected.
class _DriftingLight extends StatefulWidget {
  const _DriftingLight(
      {required this.collected,
      required this.paused,
      required this.phase,
      required this.horizontalTravel,
      required this.child});
  final bool collected;
  final bool paused;
  final double phase;
  final double horizontalTravel;
  final Widget child;

  @override
  State<_DriftingLight> createState() => _DriftingLightState();
}

class _DriftingLightState extends State<_DriftingLight>
    with SingleTickerProviderStateMixin {
  late final _motion =
      AnimationController(vsync: this, duration: const Duration(seconds: 12));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncMotion();
  }

  @override
  void didUpdateWidget(covariant _DriftingLight oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncMotion();
  }

  void _syncMotion() {
    if (MediaQuery.disableAnimationsOf(context) || widget.collected) {
      _motion.stop();
      _motion.value = 0;
    } else if (widget.paused) {
      _motion.stop();
    } else if (!_motion.isAnimating) {
      _motion.repeat();
    }
  }

  @override
  void dispose() {
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _motion,
        child: widget.child,
        builder: (context, child) {
          final strength =
              widget.collected || MediaQuery.disableAnimationsOf(context)
                  ? 0.0
                  : 1.0;
          final angle = _motion.value * math.pi * 2 + widget.phase;
          return Transform.translate(
            offset: Offset(math.sin(angle) * widget.horizontalTravel * strength,
                math.cos(angle) * 22 * strength),
            child: child,
          );
        },
      );
}

class _DustPainter extends CustomPainter {
  const _DustPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color.withValues(alpha: 0.35);
    for (final point in const [
      Offset(.35, .07),
      Offset(.64, .21),
      Offset(.13, .33),
      Offset(.85, .68),
      Offset(.24, .70),
      Offset(.66, .97),
      Offset(.42, .52),
    ]) {
      canvas.drawCircle(
          Offset(point.dx * size.width, point.dy * size.height), 1.3, paint);
    }
  }

  @override
  bool shouldRepaint(_DustPainter oldDelegate) => oldDelegate.color != color;
}

class _CrossLinesPainter extends CustomPainter {
  const _CrossLinesPainter(this.points, this.color);
  final List<Offset> points;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withValues(alpha: .7)
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    final glow = Paint()
      ..color = color.withValues(alpha: .22)
      ..strokeWidth = 6
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5);
    canvas.drawLine(points[0], points[5], glow);
    canvas.drawLine(points[1], points[3], glow);
    canvas.drawLine(points[0], points[5], paint);
    canvas.drawLine(points[1], points[3], paint);
  }

  @override
  bool shouldRepaint(_CrossLinesPainter oldDelegate) =>
      oldDelegate.color != color ||
      oldDelegate.points
          .asMap()
          .entries
          .any((entry) => entry.value != points[entry.key]);
}
