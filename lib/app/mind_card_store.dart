import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class MindCardRecord {
  const MindCardRecord({
    required this.id,
    required this.createdAt,
    required this.title,
    required this.dateLabel,
    required this.emotion,
    required this.intensity,
    required this.verseReference,
    required this.verseText,
    required this.reflectionQuestion,
    required this.action,
    required this.closingMessage,
  });

  final String id;
  final DateTime createdAt;
  final String title;
  final String dateLabel;
  final String emotion;
  final int intensity;
  final String verseReference;
  final String verseText;
  final String reflectionQuestion;
  final String action;
  final String closingMessage;

  String get fullText => [
        title,
        dateLabel,
        '내 마음: $emotion · $intensity/10',
        '함께한 말씀: $verseReference',
        verseText,
        '묵상 질문: $reflectionQuestion',
        '작은 실천: $action',
        closingMessage,
      ].join('\n\n');

  Map<String, dynamic> toJson() => {
        'id': id,
        'createdAt': createdAt.toIso8601String(),
        'title': title,
        'dateLabel': dateLabel,
        'emotion': emotion,
        'intensity': intensity,
        'verseReference': verseReference,
        'verseText': verseText,
        'reflectionQuestion': reflectionQuestion,
        'action': action,
        'closingMessage': closingMessage,
        'fullText': fullText,
      };
}

class MindCardStore {
  MindCardStore({SharedPreferencesAsync? preferences})
      : _preferences = preferences ?? SharedPreferencesAsync();

  static const _storageKey = 'soul_bible.mind_cards.v1';
  final SharedPreferencesAsync _preferences;

  Future<void> save(MindCardRecord card) async {
    final saved = await _preferences.getStringList(_storageKey) ?? <String>[];
    await _preferences.setStringList(
      _storageKey,
      <String>[jsonEncode(card.toJson()), ...saved],
    );
  }
}
