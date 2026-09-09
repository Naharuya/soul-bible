import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/space_scaffold.dart';
import '../../engagement_controller.dart';
import '../../domain_events.dart';
import 'cross_light_game.dart';

class CrossLightPage extends StatefulWidget {
  const CrossLightPage({super.key, this.game});
  final CrossLightGame? game;
  @override
  State<CrossLightPage> createState() => _CrossLightPageState();
}
class _CrossLightPageState extends State<CrossLightPage> {
  late final _game = widget.game ?? CrossLightGame();
  Timer? _timer;
  @override
  void dispose() { _timer?.cancel(); super.dispose(); }
  void _start() {
    _game.start();
    unawaited(EngagementScope.maybeOf(context)?.track(EngagementMetric.miniGameStarted) ?? Future.value());
    _timer = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted) setState(() {}); });
    setState(() {});
  }
  void _collect(String word) {
    if (!_game.collect(word)) return;
    if (_game.complete) {
      _timer?.cancel();
      unawaited(EngagementScope.maybeOf(context)?.emit(EngagementEventType.miniGameCompleted, resourceRef: 'cross_light') ?? Future.value());
    }
    setState(() {});
  }
  @override
  Widget build(BuildContext context) {
    final reduced = MediaQuery.disableAnimationsOf(context);
    return SpaceScaffold(appBar: AppBar(title: const Text('Cross Light')), body: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 620), child: ListView(padding: const EdgeInsets.all(24), children: [
        const Text('마음에 작은 빛을', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12), const Text('단어 하나를 고르고 잠시 쉬어 보세요. 30초쯤 천천히 머물러도, 더 오래 쉬어도 괜찮아요.'),
        const SizedBox(height: 28),
        Semantics(label: _game.complete ? '빛으로 완성된 십자가' : '여섯 조각 중 ${_game.pieces.length}개의 빛', child: ExcludeSemantics(
          child: SizedBox(height: 230, child: Center(child: AnimatedOpacity(opacity: 0.2 + _game.progress * 0.8,
            duration: reduced ? Duration.zero : const Duration(milliseconds: 600), child: SizedBox(width: 150, height: 220,
              child: Stack(alignment: Alignment.center, children: [
                Container(width: 34, height: 210, decoration: BoxDecoration(color: const Color(0xFFF1D798), borderRadius: BorderRadius.circular(12))),
                Positioned(top: 56, child: Container(width: 150, height: 34, decoration: BoxDecoration(color: const Color(0xFFF1D798), borderRadius: BorderRadius.circular(12)))),
              ]))))))),
        if (!_game.started) FilledButton(onPressed: _start, child: const Text('조용히 시작하기'))
        else if (_game.complete) ...[
          const Text('작은 빛이 모였어요.', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16), const Text('잠시 멈춰 숨 쉬고, 나와 이웃에게 다정함을 건네 보세요.\n— onaria 묵상 문구', textAlign: TextAlign.center),
          const SizedBox(height: 20), FilledButton(onPressed: () => Navigator.pop(context), child: const Text('편안히 돌아가기')),
        ] else ...[
          Text(_game.ready ? '마음에 머무는 단어를 골라보세요.' : '잠시 천천히 숨 쉬어 보세요.', textAlign: TextAlign.center),
          const SizedBox(height: 18),
          ...crossLightWords.entries.map((word) => Padding(padding: const EdgeInsets.only(bottom: 8), child: OutlinedButton.icon(
            onPressed: _game.ready && !_game.pieces.contains(word.key) ? () => _collect(word.key) : null,
            icon: Icon(_game.pieces.contains(word.key) ? Icons.check : Icons.light_mode_outlined), label: Text(word.value)))),
        ],
      ]))));
  }
}
