const crossLightWords = {'peace': '평안 · Peace', 'hope': '희망 · Hope', 'love': '사랑 · Love',
  'grace': '은혜 · Grace', 'courage': '용기 · Courage', 'forgiveness': '용서 · Forgiveness'};

class CrossLightGame {
  CrossLightGame({DateTime Function()? clock}) : clock = clock ?? DateTime.now;
  final DateTime Function() clock;
  DateTime? _last;
  final Set<String> _pieces = {};
  Set<String> get pieces => Set.unmodifiable(_pieces);
  bool get started => _last != null;
  bool get complete => _pieces.length == crossLightWords.length;
  bool get ready => started && !complete && clock().difference(_last!) >= const Duration(seconds: 5);
  double get progress => _pieces.length / crossLightWords.length;
  void start() { _last ??= clock(); }
  bool collect(String word) {
    if (!ready || !crossLightWords.containsKey(word) || _pieces.contains(word)) return false;
    _pieces.add(word); _last = clock(); return true;
  }
}
