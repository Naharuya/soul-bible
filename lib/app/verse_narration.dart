import '../src/verses/verse_models.dart';

enum NarrationPace {
  calm('차분하게', 0.46),
  natural('편안하게', 0.50),
  slow('천천히', 0.38);

  const NarrationPace(this.label, this.rate);
  final String label;
  final double rate;
}

/// Only engine-advertised voices are selected. No provider API or rewritten verse.
List<Map<String, String>> narrationVoices(dynamic raw, String locale) {
  if (raw is! List) return [];
  final candidates = raw.whereType<Map>().where((voice) {
    final language = '${voice['locale']}'.replaceAll('_', '-').toLowerCase();
    final network = '${voice['network_required']}'.toLowerCase();
    final features = '${voice['features']}'.toLowerCase();
    return language == locale.toLowerCase() &&
        voice['name'] is String &&
        network != 'true' &&
        network != '1' &&
        !features.contains('notinstalled');
  }).toList();
  int quality(Map voice) => switch ('${voice['quality']}'.toLowerCase()) {
        'very high' => 500,
        'high' => 400,
        'normal' => 300,
        'low' => 200,
        'very low' => 100,
        _ => int.tryParse('${voice['quality']}') ?? 0,
      };
  candidates.sort((a, b) => quality(b).compareTo(quality(a)));
  return candidates
      .map((voice) => {
            'name': voice['name'] as String,
            'locale': voice['locale'] as String,
            if (voice['identifier'] is String)
              'identifier': voice['identifier'] as String,
          })
      .toList();
}

List<(String, String)> verseNarration(BibleVerse verse, String language) => [
      if (language != 'english' || verse.englishText.isEmpty)
        ('ko-KR', '${verse.koreanSpokenReference} 말씀입니다.\n\n${verse.text}'),
      if (language != 'korean' && verse.englishText.isNotEmpty)
        ('en-US', '${verse.reference}.\n\n${verse.englishText}'),
    ];
