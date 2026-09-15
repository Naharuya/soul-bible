import 'package:shared_preferences/shared_preferences.dart';
import '../src/verses/verse_models.dart';

/// Keep only verse identifiers; conversation contents are never stored here.
class VerseHistory {
  static const storageKey = 'onaria.recent_verses.v1';
  Future<BibleVerse?> choose(List<BibleVerse> candidates) async {
    if (candidates.isEmpty) return null;
    final preferences = SharedPreferencesAsync();
    var recent = <String>[];
    try {
      recent = await preferences.getStringList(storageKey) ?? [];
    } catch (_) { /* Reading history must not prevent showing a verse. */ }
    var chosen = candidates.first;
    for (final verse in candidates) {
      if (recent.indexOf(verse.id) < recent.indexOf(chosen.id)) chosen = verse;
    }
    try {
      await preferences.setStringList(storageKey,
          [...recent.where((id) => id != chosen.id), chosen.id].reversed.take(30).toList().reversed.toList());
    } catch (_) { /* History is optional. */ }
    return chosen;
  }
}
