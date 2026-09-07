import '../conversation/conversation_models.dart';

class BibleVerse {
  const BibleVerse({
    required this.id,
    required this.book,
    required this.chapter,
    required this.verseStart,
    required this.verseEnd,
    required this.reference,
    required this.translation,
    required this.text,
    required this.englishText,
    required this.emotions,
    required this.tags,
    required this.reflectionQuestion,
  });

  final String id;
  final String book;
  final int chapter;
  final int verseStart;
  final int? verseEnd;
  final String reference;
  final String translation;
  final String text;
  final String englishText;
  final List<EmotionType> emotions;
  final List<String> tags;
  final String reflectionQuestion;

  /// Use spoken Korean units instead of asking TTS to interpret ':' and '-'.
  String get koreanSpokenReference {
    final chapterUnit = book == '시편' ? '편' : '장';
    final start =
        '$book ${_koreanNumber(chapter)}$chapterUnit ${_koreanNumber(verseStart)}절';
    final end = verseEnd;
    return end != null && end > verseStart
        ? '$start부터 ${_koreanNumber(end)}절까지'
        : start;
  }

  static String _koreanNumber(int number) {
    if (number < 1 || number > 9999) return number.toString();
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const units = ['', '십', '백', '천'];
    final result = StringBuffer();
    var divisor = 1000;
    for (var position = 3; position >= 0; position--) {
      final digit = number ~/ divisor % 10;
      if (digit > 0) {
        if (digit != 1 || position == 0) result.write(digits[digit]);
        result.write(units[position]);
      }
      divisor ~/= 10;
    }
    return result.toString();
  }

  factory BibleVerse.fromJson(Map<String, dynamic> json) {
    return BibleVerse(
      id: json['id'] as String,
      book: json['book'] as String,
      chapter: json['chapter'] as int,
      verseStart: json['verseStart'] as int,
      verseEnd: json['verseEnd'] as int?,
      reference: json['reference'] as String,
      translation: json['translation'] as String,
      text: json['text'] as String,
      englishText: json['englishText'] as String? ?? '',
      emotions: (json['emotions'] as List)
          .whereType<String>()
          .map(EmotionType.fromWire)
          .toList(growable: false),
      tags: (json['tags'] as List).whereType<String>().toList(growable: false),
      reflectionQuestion: json['reflectionQuestion'] as String,
    );
  }
}
