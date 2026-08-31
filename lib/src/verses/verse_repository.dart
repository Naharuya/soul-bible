import 'dart:convert';

import '../conversation/conversation_models.dart';
import 'verse_models.dart';

abstract interface class VerseAssetLoader {
  Future<String> loadString(String path);
}

class VerseRepository {
  VerseRepository({
    required VerseAssetLoader loader,
    this.assetPath = 'assets/data/bible_verses_ko.json',
  }) : _loader = loader;

  final VerseAssetLoader _loader;
  final String assetPath;
  List<BibleVerse>? _cache;

  Future<List<BibleVerse>> loadAll() async {
    if (_cache != null) return _cache!;
    final raw = await _loader.loadString(assetPath);
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic> || decoded['verses'] is! List) {
      throw const FormatException('Invalid verse asset structure.');
    }
    _cache = (decoded['verses'] as List)
        .whereType<Map<String, dynamic>>()
        .map(BibleVerse.fromJson)
        .toList(growable: false);
    return _cache!;
  }

  Future<List<BibleVerse>> findForEmotion(
    EmotionType emotion, {
    List<String> preferredTags = const [],
    int limit = 3,
  }) async {
    final verses = await loadAll();
    final matches = verses.where((verse) => verse.emotions.contains(emotion)).toList();

    matches.sort((a, b) {
      final aScore = a.tags.where(preferredTags.contains).length;
      final bScore = b.tags.where(preferredTags.contains).length;
      return bScore.compareTo(aScore);
    });

    return matches.take(limit).toList(growable: false);
  }

  Future<BibleVerse?> getById(String id) async {
    final verses = await loadAll();
    for (final verse in verses) {
      if (verse.id == id) return verse;
    }
    return null;
  }
}
