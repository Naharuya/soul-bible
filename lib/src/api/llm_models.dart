import '../conversation/conversation_models.dart';

class LlmConversationRequest {
  const LlmConversationRequest({
    required this.session,
    required this.userMessage,
    required this.systemPromptVersion,
    this.allowedVerseIds = const [],
    this.locale = 'ko-KR',
    this.agentMode = 'auto',
    this.verseLanguage = 'bilingual',
  });

  final ConversationSession session;
  final String userMessage;
  final String systemPromptVersion;
  final List<String> allowedVerseIds;
  final String locale;
  final String agentMode;
  final String verseLanguage;

  Map<String, dynamic> toJson() => {
        'session': session.toJson(),
        'userMessage': userMessage,
        'systemPromptVersion': systemPromptVersion,
        'allowedVerseIds': allowedVerseIds,
        'locale': locale,
        'agentMode': agentMode,
        'verseLanguage': verseLanguage,
      };
}

class LlmConversationResponse {
  const LlmConversationResponse({
    required this.message,
    required this.stage,
    required this.detectedEmotion,
    required this.riskLevel,
    required this.shouldOfferVerse,
    required this.shouldEndConversation,
    this.question,
    this.answerExamples = const [],
    this.secondaryEmotion,
    this.verseTags = const [],
    this.actionTags = const [],
    this.suggestedVerseId,
    this.agent = 'integrated',
    this.memorySummary = '',
    this.clinicalReflection,
    this.integratedInsight,
  });

  final String message;
  final String? question;
  final List<String> answerExamples;
  final ConversationStage stage;
  final EmotionType detectedEmotion;
  final String? secondaryEmotion;
  final int riskLevel;
  final bool shouldOfferVerse;
  final List<String> verseTags;
  final List<String> actionTags;
  final bool shouldEndConversation;
  final String? suggestedVerseId;
  final String agent;
  final String memorySummary;
  final String? clinicalReflection;
  final String? integratedInsight;

  factory LlmConversationResponse.fromJson(Map<String, dynamic> json) {
    final risk = (json['riskLevel'] as num?)?.toInt() ?? 0;
    if (risk < 0 || risk > 3) {
      throw const FormatException('riskLevel must be between 0 and 3.');
    }

    return LlmConversationResponse(
      message: _requiredString(json, 'message'),
      question: _nullableString(json['question']),
      // Older servers omit this optional field. Bad suggestions cannot discard
      // an otherwise valid conversation response.
      answerExamples: json['answerExamples'] is List
          ? (json['answerExamples'] as List).whereType<String>().toList()
          : const [],
      stage: ConversationStage.fromWire(
        _requiredString(json, 'stage'),
      ),
      detectedEmotion: EmotionType.fromWire(
        _requiredString(json, 'detectedEmotion'),
      ),
      secondaryEmotion: _nullableString(json['secondaryEmotion']),
      riskLevel: risk,
      shouldOfferVerse: json['shouldOfferVerse'] == true,
      verseTags: _stringList(json['verseTags']),
      actionTags: _stringList(json['actionTags']),
      shouldEndConversation: json['shouldEndConversation'] == true,
      suggestedVerseId: _nullableString(json['suggestedVerseId']),
      agent: _requiredString(json, 'agent'),
      memorySummary: _stringOrEmpty(json['memorySummary']),
      clinicalReflection: _nullableString(json['clinicalReflection']),
      integratedInsight: _nullableString(json['integratedInsight']),
    );
  }

  Map<String, dynamic> toJson() => {
        'message': message,
        'question': question,
        if (answerExamples.isNotEmpty) 'answerExamples': answerExamples,
        'stage': stage.wireName,
        'detectedEmotion': detectedEmotion.label,
        'secondaryEmotion': secondaryEmotion,
        'riskLevel': riskLevel,
        'shouldOfferVerse': shouldOfferVerse,
        'verseTags': verseTags,
        'actionTags': actionTags,
        'shouldEndConversation': shouldEndConversation,
        'suggestedVerseId': suggestedVerseId,
        'agent': agent,
        'memorySummary': memorySummary,
        'clinicalReflection': clinicalReflection,
        'integratedInsight': integratedInsight,
      };

  static String _requiredString(Map<String, dynamic> json, String key) {
    final value = json[key];
    if (value is! String || value.trim().isEmpty) {
      throw FormatException('$key must be a non-empty string.');
    }
    return value.trim();
  }

  static String? _nullableString(Object? value) {
    if (value == null) return null;
    if (value is! String) {
      throw const FormatException('Expected nullable string.');
    }
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  static String _stringOrEmpty(Object? value) => value is String ? value.trim() : '';

  static List<String> _stringList(Object? value) {
    if (value == null) return const [];
    if (value is! List) {
      throw const FormatException('Expected a list.');
    }
    return value.whereType<String>().map((e) => e.trim()).where(
      (e) => e.isNotEmpty,
    ).toList(growable: false);
  }
}
