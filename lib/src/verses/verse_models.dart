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
