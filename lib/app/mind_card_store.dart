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
    this.englishVerseText,
    required this.reflectionQuestion,
    required this.action,
    required this.closingMessage,
    this.agent = 'integrated',
    this.memorySummary = '',
    this.clinicalReflection,
    this.integratedInsight,
    this.verseLanguage = 'bilingual',
  });

  final String id;
  final DateTime createdAt;
  final String title;
  final String dateLabel;
  final String emotion;
  final int intensity;
  final String verseReference;
  final String verseText;
  final String? englishVerseText;
  final String reflectionQuestion;
  final String action;
  final String closingMessage;
  final String agent;
  final String memorySummary;
  final String? clinicalReflection;
  final String? integratedInsight;
  final String verseLanguage;

  String get fullText => [
        title,
        dateLabel,
        '내 마음: $emotion · $intensity/10',
        '함께한 말씀: $verseReference',
        verseText,
        if (englishVerseText != null && englishVerseText!.isNotEmpty)
          'English (NIV):\n$englishVerseText',
        '묵상 질문: $reflectionQuestion',
        '작은 실천: $action',
        if (clinicalReflection != null && clinicalReflection!.isNotEmpty)
          '임상심리 성찰: $clinicalReflection',
        if (integratedInsight != null && integratedInsight!.isNotEmpty)
          '심리·신앙 통합 인사이트: $integratedInsight',
        if (memorySummary.isNotEmpty) 'AI 기억 요약: $memorySummary',
        closingMessage,
      ].join('\n\n');

  factory MindCardRecord.fromJson(Map<String, dynamic> json) => MindCardRecord(
        id: json['id'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
        title: json['title'] as String,
        dateLabel: json['dateLabel'] as String,
        emotion: json['emotion'] as String,
        intensity: json['intensity'] as int,
        verseReference: json['verseReference'] as String,
        verseText: json['verseText'] as String,
        englishVerseText: json['englishVerseText'] as String?,
        reflectionQuestion: json['reflectionQuestion'] as String,
        action: json['action'] as String,
        closingMessage: json['closingMessage'] as String,
        agent: json['agent'] as String? ?? 'integrated',
        memorySummary: json['memorySummary'] as String? ?? '',
        clinicalReflection: json['clinicalReflection'] as String?,
        integratedInsight: json['integratedInsight'] as String?,
        verseLanguage: json['verseLanguage'] as String? ?? 'bilingual',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'createdAt': createdAt.toIso8601String(),
        'title': title,
        'dateLabel': dateLabel,
        'emotion': emotion,
        'intensity': intensity,
        'verseReference': verseReference,
        'verseText': verseText,
        'englishVerseText': englishVerseText,
        'reflectionQuestion': reflectionQuestion,
        'action': action,
        'closingMessage': closingMessage,
        'agent': agent,
        'memorySummary': memorySummary,
        'clinicalReflection': clinicalReflection,
        'integratedInsight': integratedInsight,
        'verseLanguage': verseLanguage,
      };
}

class MindCardStore {
  MindCardStore({SharedPreferencesAsync? preferences})
      : _preferences = preferences ?? SharedPreferencesAsync();

  static const _storageKey = 'soul_bible.mind_cards.v1';
  final SharedPreferencesAsync _preferences;

  Future<void> save(MindCardRecord card) async {
    final saved = await _preferences.getStringList(_storageKey) ?? <String>[];
    final filtered = saved.where((value) {
      try {
        final decoded = jsonDecode(value);
        return decoded is! Map<String, dynamic> || decoded['id'] != card.id;
      } catch (_) {
        return true;
      }
    });
    await _preferences.setStringList(
      _storageKey,
      <String>[jsonEncode(card.toJson()), ...filtered.take(100)],
    );
  }

  Future<void> delete(String id) async {
    final saved = await _preferences.getStringList(_storageKey) ?? <String>[];
    final remaining = saved.where((value) {
      try {
        final decoded = jsonDecode(value);
        return decoded is! Map<String, dynamic> || decoded['id'] != id;
      } catch (_) {
        return true;
      }
    }).toList(growable: false);
    await _preferences.setStringList(_storageKey, remaining);
  }

  Future<List<MindCardRecord>> getAll() async {
    final saved = await _preferences.getStringList(_storageKey) ?? <String>[];
    final cards = <MindCardRecord>[];
    for (final value in saved) {
      try {
        final decoded = jsonDecode(value);
        if (decoded is Map<String, dynamic>) {
          cards.add(MindCardRecord.fromJson(decoded));
        }
      } on FormatException {
        // Ignore an individual damaged record and keep the remaining cards usable.
      } on TypeError {
        // Ignore an individual record with an incompatible older schema.
      }
    }
    return cards;
  }
}

enum MembershipTier { free, premium }

class MembershipConfig {
  const MembershipConfig._();

  static const _premiumMember = String.fromEnvironment(
    'SOUL_BIBLE_PREMIUM_MEMBER',
    defaultValue: 'false',
  );

  static MembershipTier get current =>
      _premiumMember.toLowerCase() == 'true'
          ? MembershipTier.premium
          : MembershipTier.free;
}

class DailyUsageStore {
  DailyUsageStore({
    SharedPreferencesAsync? preferences,
    MembershipTier? tier,
  })  : _preferences = preferences ?? SharedPreferencesAsync(),
        tier = tier ?? MembershipConfig.current;

  static const _dateKey = 'soul_bible.daily_usage.date.v1';
  static const _countKey = 'soul_bible.daily_usage.count.v1';
  final SharedPreferencesAsync _preferences;
  final MembershipTier tier;

  bool get isPremium => tier == MembershipTier.premium;

  Future<int> getCount() async {
    final today = _todayKey();
    final savedDate = await _preferences.getString(_dateKey);
    if (savedDate != today) return 0;
    return await _preferences.getInt(_countKey) ?? 0;
  }

  Future<bool> tryConsume() async {
    final count = await getCount();
    await _preferences.setString(_dateKey, _todayKey());
    await _preferences.setInt(_countKey, count + 1);
    return true;
  }

  String _todayKey() {
    final now = DateTime.now();
    final month = now.month.toString().padLeft(2, '0');
    final day = now.day.toString().padLeft(2, '0');
    return '${now.year}-$month-$day';
  }
}
