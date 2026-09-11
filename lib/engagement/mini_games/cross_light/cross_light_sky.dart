import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';

import 'cross_light_game.dart';

/// Each light moves from a quiet scattered position to its place on the cross.
class CrossLightSky extends StatefulWidget {
  const CrossLightSky(
      {super.key,
      required this.pieces,
      required this.ready,
      this.paused = false,
      required this.onCollect});
  final Set<String> pieces;
  final bool ready;
  final bool paused;
  final ValueChanged<String> onCollect;

  @override
  State<CrossLightSky> createState() => _CrossLightSkyState();
}

class _CrossLightSkyState extends State<CrossLightSky> {
  final _surface = GlobalKey();
  String? _dragging;
  Offset? _dragPosition;
  Set<String> get pieces => widget.pieces;
  bool get ready => widget.ready;
  bool get paused => widget.paused;
  bool _canMove(String word) => ready && !paused && !pieces.contains(word);
  void onCollect(String word) => widget.onCollect(word);

  void _move(String word, Offset global, double width, double height) {
    if (!ready || paused || pieces.contains(word)) return;
    if (_dragging != null && _dragging != word) return;
    final box = _surface.currentContext!.findRenderObject() as RenderBox;
    final point = box.globalToLocal(global) - const Offset(24, 24);
    setState(() {
      _dragging = word;
      _dragPosition =
          Offset(point.dx.clamp(0, width - 48), point.dy.clamp(0, height - 48));
    });
  }

  void _release(Rect target, {bool cancel = false}) {
    final word = _dragging;
    final accepted = !cancel &&
        ready &&
        !paused &&
        word != null &&
        target.contains(_dragPosition! + const Offset(24, 24));
    setState(() {
      _dragging = null;
      _dragPosition = null;
    });
    if (accepted) onCollect(word);
  }

  @override
  void didUpdateWidget(covariant CrossLightSky oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!ready || paused) {
      _dragging = null;
      _dragPosition = null;
    }
  }

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

  @override
  Widget build(BuildContext context) {
    const lightColor = Color(0xFFFFE3A0);
    final reduced = MediaQuery.disableAnimationsOf(context);
    final duration =
        reduced ? Duration.zero : const Duration(milliseconds: 900);
    return LayoutBuilder(builder: (context, constraints) {
      final width = constraints.maxWidth.clamp(48.0, 340.0);
      const height = 300.0;
      final gatheringArea = Rect.fromCenter(
          center: Offset(width / 2, height / 2),
          width: math.min(140, width * .5),
          height: 180);
      Offset position(Offset point) =>
          Offset(point.dx * (width - 48), point.dy * (height - 48));
      final targets = _cross
          .map((point) => position(point) + const Offset(24, 24))
          .toList();
      return Center(
          child: SizedBox(
              width: width,
              height: height,
              child: Stack(key: _surface, children: [
                Positioned.fill(
                    child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    gradient: const RadialGradient(
                        colors: [Color(0xFF24354C), Color(0xFF0A1020)],
                        radius: .9),
                  ),
                )),
                Positioned.fromRect(
                  rect: gatheringArea,
                  child: IgnorePointer(
                      child: AnimatedOpacity(
                    opacity: pieces.length == crossLightWords.length ? 0 : .5,
                    duration: duration,
                    child: DecoratedBox(
                      key: const ValueKey('cross-gathering-area'),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(36),
                        border: Border.all(color: const Color(0xFFB6C7E2)),
                        color: const Color(0x163F5879),
                      ),
                    ),
                  )),
                ),
                Positioned.fill(
                    child: IgnorePointer(
                        child: AnimatedOpacity(
                  key: const ValueKey('cross-quiet-glow'),
                  opacity: pieces.length == crossLightWords.length ? 1 : 0,
                  duration: duration,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(colors: [
                        lightColor.withValues(alpha: .14),
                        lightColor.withValues(alpha: 0),
                      ]),
                    ),
                  ),
                ))),
                Positioned.fill(
                    child: IgnorePointer(
                        child: CustomPaint(
                            painter: _DustPainter(const Color(0xFFB9C8E2))))),
                Positioned.fill(
                    child: IgnorePointer(
                        child: AnimatedOpacity(
                  opacity: pieces.length == crossLightWords.length ? 1 : 0,
                  duration: duration,
                  child: CustomPaint(
                      key: const ValueKey('cross-starlight-lines'),
                      painter: _CrossLinesPainter(targets, lightColor)),
                ))),
                for (final entry in crossLightWords.entries.indexed)
                  AnimatedPositioned(
                    key: ValueKey('cross-piece-${entry.$2.key}'),
                    duration:
                        _dragging == entry.$2.key ? Duration.zero : duration,
                    curve: Curves.easeInOutCubic,
                    left: _dragging == entry.$2.key
                        ? _dragPosition!.dx
                        : position(pieces.contains(entry.$2.key)
                                ? _cross[entry.$1]
                                : _scattered[entry.$1])
                            .dx,
                    top: _dragging == entry.$2.key
                        ? _dragPosition!.dy
                        : position(pieces.contains(entry.$2.key)
                                ? _cross[entry.$1]
                                : _scattered[entry.$1])
                            .dy,
                    width: 48,
                    height: 48,
                    child: _DriftingLight(
                      collected: pieces.contains(entry.$2.key) ||
                          _dragging == entry.$2.key,
                      paused: paused,
                      phase: entry.$1 * .8,
                      horizontalTravel: math.min(30, (width - 48) * .14),
                      child: RawGestureDetector(
                        gestures: {
                          if (_canMove(entry.$2.key))
                            ImmediateMultiDragGestureRecognizer:
                                GestureRecognizerFactoryWithHandlers<
                                    ImmediateMultiDragGestureRecognizer>(
                              () => ImmediateMultiDragGestureRecognizer(),
                              (recognizer) => recognizer.onStart = (position) {
                                if (_dragging != null) return null;
                                _move(entry.$2.key, position, width, height);
                                return _LightDrag(
                                  (details) => _move(entry.$2.key,
                                      details.globalPosition, width, height),
                                  () => _release(gatheringArea),
                                  () => _release(gatheringArea, cancel: true),
                                );
                              },
                            ),
                        },
                        child: Semantics(
                          label: '${entry.$2.value}의 빛',
                          hint: '중앙으로 끌어 모으세요. 두 번 탭해서 모을 수도 있어요.',
                          button: !pieces.contains(entry.$2.key),
                          enabled: ready && !pieces.contains(entry.$2.key),
                          selected: pieces.contains(entry.$2.key),
                          onTap: ready && !pieces.contains(entry.$2.key)
                              ? () => onCollect(entry.$2.key)
                              : null,
                          child: Tooltip(
                            message: entry.$2.value,
                            excludeFromSemantics: true,
                            child: InkResponse(
                              key:
                                  ValueKey('cross-light-touch-${entry.$2.key}'),
                              onTap: ready && !pieces.contains(entry.$2.key)
                                  ? () => onCollect(entry.$2.key)
                                  : null,
                              radius: 24,
                              containedInkWell: true,
                              excludeFromSemantics: true,
                              child: ExcludeSemantics(
                                  child: Center(
                                      child: AnimatedDefaultTextStyle(
                                duration: duration,
                                style: TextStyle(
                                    fontSize:
                                        pieces.contains(entry.$2.key) ? 28 : 24,
                                    color:
                                        pieces.contains(entry.$2.key) || ready
                                            ? lightColor
                                            : const Color(0xFFB9C8E2),
                                    shadows: [
                                      Shadow(
                                          color:
                                              lightColor.withValues(alpha: 0.4),
                                          blurRadius: 12)
                                    ]),
                                child: Text(
                                    pieces.contains(entry.$2.key) ||
                                            entry.$1.isEven
                                        ? '✦'
                                        : '✧',
                                    textScaler: TextScaler.noScaling),
                              ))),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ])));
    });
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
      Offset(.42, .52)
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

class _LightDrag extends Drag {
  _LightDrag(this.onUpdate, this.onEnd, this.onCancel);
  final ValueChanged<DragUpdateDetails> onUpdate;
  final VoidCallback onEnd;
  final VoidCallback onCancel;
  @override
  void update(DragUpdateDetails details) => onUpdate(details);
  @override
  void end(DragEndDetails details) => onEnd();
  @override
  void cancel() => onCancel();
}
