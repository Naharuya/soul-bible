const crossLightWords = {
  'peace': '평안',
  'hope': '희망',
  'love': '사랑',
  'grace': '은혜',
  'courage': '용기',
  'forgiveness': '용서'
};

class CrossLightGame {
  CrossLightGame({DateTime Function()? clock}) : clock = clock ?? DateTime.now;
  final DateTime Function() clock;
  DateTime? _last;
  DateTime? _pausedAt;
  final Set<String> _pieces = {};
  Set<String> get pieces => Set.unmodifiable(_pieces);
  bool get started => _last != null;
  bool get complete => _pieces.length == crossLightWords.length;
  bool get paused => _pausedAt != null;
  Duration get remaining {
    if (!started || complete) return Duration.zero;
    final elapsed = (_pausedAt ?? clock()).difference(_last!);
    return Duration(
        milliseconds: (5000 - elapsed.inMilliseconds).clamp(0, 5000));
  }

  int get remainingSeconds => (remaining.inMilliseconds / 1000).ceil();
  bool get ready =>
      started && !complete && !paused && remaining == Duration.zero;
  double get progress => _pieces.length / crossLightWords.length;
  void start({bool immediatelyReady = false}) {
    _last ??= clock().subtract(
        immediatelyReady ? const Duration(seconds: 5) : Duration.zero);
  }

  void pause() {
    if (started && !complete && !paused) _pausedAt = clock();
  }

  void resume() {
    if (_pausedAt == null) return;
    final away = clock().difference(_pausedAt!);
    if (!away.isNegative) _last = _last!.add(away);
    _pausedAt = null;
  }

  void restart() {
    _pieces.clear();
    _last = clock();
    _pausedAt = null;
  }

  bool collect(String word) {
    if (!ready ||
        !crossLightWords.containsKey(word) ||
        _pieces.contains(word)) {
      return false;
    }
    _pieces.add(word);
    _last = clock();
    return true;
  }
}
