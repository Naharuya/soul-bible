import 'dart:async';
import 'package:flutter/material.dart';
import 'cross_light_sky.dart';
import '../../../app/space_scaffold.dart';
import '../../engagement_controller.dart';
import '../../domain_events.dart';
import 'cross_light_game.dart';

class CrossLightPage extends StatefulWidget {
  const CrossLightPage({super.key, this.game, this.continueToMindCard = false});
  final CrossLightGame? game;
  final bool continueToMindCard;
  @override
  State<CrossLightPage> createState() => _CrossLightPageState();
}

class _CrossLightPageState extends State<CrossLightPage>
    with WidgetsBindingObserver {
  late final _game = widget.game ?? CrossLightGame();
  Timer? _timer;
  final _scroll = ScrollController();
  bool _restartPrompt = false;
  bool _exitRecorded = false;
  late DateTime _roundStarted = _game.clock();
  EngagementController? _engagement;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _engagement = EngagementScope.maybeOf(context);
  }

  void _event(EngagementEventType type) {
    final duration = _game.clock().difference(_roundStarted).inMilliseconds;
    unawaited(_engagement?.emit(type,
            resourceRef: 'cross_light',
            durationMs: duration < 0 ? 0 : duration,
            completed: _game.complete,
            entryPoint:
                widget.continueToMindCard ? 'mind_card' : 'engagement_menu') ??
        Future<void>.value());
  }

  void _recordExit() {
    if (_exitRecorded || _game.complete) return;
    _exitRecorded = true;
    _event(EngagementEventType.crossGameSkipped);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _roundStarted = _game.clock();
    if (_game.started && !_game.complete && !_game.paused) _tick();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _pause();
  }

  void _tick() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (mounted && ModalRoute.of(context)?.isCurrent == false) {
        _pause();
        return;
      }
      if (mounted) setState(() {});
    });
  }

  void _start({bool restart = false}) {
    if (!restart && _game.started) return;
    if (restart) {
      _event(EngagementEventType.crossGameReplayed);
      _game.restart();
    } else {
      _game.start(immediatelyReady: true);
    }
    _roundStarted = _game.clock();
    _exitRecorded = false;
    _event(EngagementEventType.crossGameStarted);
    _tick();
    setState(() {});
    if (restart) _scrollTop();
  }

  void _pause() {
    if (!_game.started || _game.complete || _game.paused) return;
    _game.pause();
    _timer?.cancel();
    if (mounted) setState(() {});
  }

  void _resume() {
    _game.resume();
    _tick();
    setState(() {});
  }

  Future<void> _restart() async {
    if (_restartPrompt) return;
    if (_game.complete) {
      _start(restart: true);
      return;
    }
    _restartPrompt = true;
    _pause();
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('처음부터 다시 할까요?'),
              content: const Text('이번에 모은 빛 조각을 비우고 다시 시작해요.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('취소')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('다시 시작')),
              ],
            ));
    _restartPrompt = false;
    if (confirmed == true && mounted) _start(restart: true);
  }

  void _collect(String word) {
    if (!_game.started) _start();
    if (!_game.collect(word)) return;
    if (_game.complete) {
      _timer?.cancel();
      _event(EngagementEventType.crossGameCompleted);
      _scrollTop();
    }
    setState(() {});
  }

  void _scrollTop() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      if (MediaQuery.disableAnimationsOf(context)) {
        _scroll.jumpTo(0);
      } else {
        _scroll.animateTo(0,
            duration: const Duration(milliseconds: 350), curve: Curves.easeOut);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final restVerse = EngagementScope.maybeOf(context)?.verse('MAT_11_28');
    return PopScope(
        onPopInvokedWithResult: (didPop, result) {
          if (didPop) _recordExit();
        },
        child: SpaceScaffold(
          appBar: AppBar(title: const Text('빛 조각으로 십자가 완성하기')),
          body: SafeArea(
              top: false,
              child: Center(
                  child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 620),
                child: ListView(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 48),
                    children: [
                      const Text('마음에 작은 빛을',
                          style: TextStyle(
                              fontSize: 28, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      const Text(
                          '떠다니는 별들 중 한 번에 하나씩 반짝이는 별을 천천히 터치해 주세요. 빛이 하나씩 모여 십자가가 돼요.'),
                      const SizedBox(height: 12),
                      CrossLightSky(
                          pieces: _game.pieces,
                          ready: !_game.started || _game.ready,
                          paused: _game.paused,
                          onCollect: _collect),
                      const SizedBox(height: 12),
                      Text(
                          _game.complete
                              ? '나를 위한 작은 쉼을 만들었어요.'
                              : '반짝이는 빛을 하나씩 모아 보세요.',
                          textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      if (!_game.started) ...[
                        const Text(
                            '지금 반짝이는 별 하나를 터치해 시작해 보세요.\n여섯 개의 별을 모두 모으면 작은 쉼이 완성돼요.',
                            textAlign: TextAlign.center),
                      ] else if (_game.complete) ...[
                        const Text('오늘 내려놓고 싶은 마음 하나를\n잠시 생각해 보세요.',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 18, height: 1.6)),
                        const SizedBox(height: 16),
                        const Text('작은 빛이 모였어요.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                fontSize: 24, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 12),
                        if (restVerse != null)
                          Card(
                            key: const ValueKey('cross-rest-verse'),
                            child: Padding(
                                padding: const EdgeInsets.all(18),
                                child: Column(children: [
                                  const Text('잠시 곁에 둘 말씀'),
                                  const SizedBox(height: 10),
                                  Text(restVerse.text,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(height: 1.7)),
                                  const SizedBox(height: 8),
                                  Text(restVerse.reference,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w600)),
                                ])),
                          )
                        else
                          const Text(
                              '잠시 멈춰 숨 쉬고, 나와 이웃에게 다정함을 건네 보세요.\n— onaria 묵상 문구',
                              textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(
                            onPressed: () => Navigator.pop(context, true),
                            child: Text(widget.continueToMindCard
                                ? '작은 성장 기록 보기'
                                : '편안히 돌아가기')),
                        TextButton(
                            onPressed: _restart,
                            child: const Text('한 번 더 빛 모으기')),
                      ] else ...[
                        Text(
                            _game.paused
                                ? '잠시 쉬는 중이에요. 모은 빛은 그대로 있어요.'
                                : _game.ready
                                    ? '지금 반짝이는 별 하나를 천천히 터치해 주세요.'
                                    : '천천히 숨 쉬어 보세요. 곧 다음 별이 반짝여요.',
                            textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 12,
                            children: [
                              TextButton.icon(
                                  onPressed: _game.paused ? _resume : _pause,
                                  icon: Icon(_game.paused
                                      ? Icons.play_arrow
                                      : Icons.pause),
                                  label:
                                      Text(_game.paused ? '이어서 하기' : '잠시 쉬기')),
                              TextButton(
                                  onPressed: _restart,
                                  child: const Text('처음부터')),
                            ]),
                      ],
                      if (!_game.complete) ...[
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: () {
                            _recordExit();
                            Navigator.pop(context, false);
                          },
                          child: Text(widget.continueToMindCard
                              ? '이번에는 여기까지'
                              : '이번에는 여기까지'),
                        ),
                      ],
                    ]),
              ))),
        ));
  }
}
