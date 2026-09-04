enum EmotionType {
  anxiety('불안'),
  loneliness('외로움'),
  exhaustion('지침'),
  anger('분노'),
  sadness('슬픔'),
  complexity('복잡함'),
  gratitude('감사'),
  joy('기쁨'),
  fear('공포'),
  disgust('혐오'),
  surprise('놀람'),
  happiness('행복'),
  anticipation('기대'),
  admiration('감탄'),
  overwhelmed('벅찬'),
  jealousy('질투');

  const EmotionType(this.label);
  final String label;

  String get naturalFeelingPhrase => switch (this) {
        EmotionType.anxiety => '불안한 마음',
        EmotionType.loneliness => '외로운 마음',
        EmotionType.exhaustion => '지친 마음',
        EmotionType.anger => '분노가 느껴지는 마음',
        EmotionType.sadness => '슬픈 마음',
        EmotionType.complexity => '복잡한 마음',
        EmotionType.gratitude => '감사한 마음',
        EmotionType.joy => '기쁜 마음',
        EmotionType.fear => '두려운 마음',
        EmotionType.disgust => '불편한 마음',
        EmotionType.surprise => '놀란 마음',
        EmotionType.happiness => '행복한 마음',
        EmotionType.anticipation => '기대되는 마음',
        EmotionType.admiration => '감탄하는 마음',
        EmotionType.overwhelmed => '벅찬 마음',
        EmotionType.jealousy => '질투가 나는 마음',
      };

  static EmotionType fromWire(String value) {
    return EmotionType.values.firstWhere(
      (item) => item.name == value || item.label == value,
      orElse: () => EmotionType.happiness,
    );
  }
}

enum ConversationStage {
  emotion,
  situation,
  thought,
  need,
  verseOffer,
  verseReflection,
  action,
  summary,
  crisis,
  ended;

  String get wireName => switch (this) {
        ConversationStage.verseOffer => 'verse_offer',
        ConversationStage.verseReflection => 'verse_reflection',
        _ => name,
      };

  static ConversationStage fromWire(String value) {
    return switch (value) {
      'verse_offer' => ConversationStage.verseOffer,
      'verse_reflection' => ConversationStage.verseReflection,
      'ended' => ConversationStage.ended,
      _ => ConversationStage.values.firstWhere(
          (stage) => stage.name == value,
          orElse: () => ConversationStage.emotion,
        ),
    };
  }
}

class ConversationSession {
  const ConversationSession({
    required this.sessionId,
    required this.selectedEmotion,
    required this.emotionIntensity,
    this.stage = ConversationStage.emotion,
    this.turnCount = 0,
    this.summary = '',
    this.lastUserMessage,
    this.lastAssistantQuestion,
    this.verseAccepted,
    this.selectedVerseId,
    this.riskLevel = 0,
    this.isEnded = false,
  });

  final String sessionId;
  final EmotionType selectedEmotion;
  final int emotionIntensity;
  final ConversationStage stage;
  final int turnCount;
  final String summary;
  final String? lastUserMessage;
  final String? lastAssistantQuestion;
  final bool? verseAccepted;
  final String? selectedVerseId;
  final int riskLevel;
  final bool isEnded;

  ConversationSession copyWith({
    ConversationStage? stage,
    int? turnCount,
    String? summary,
    String? lastUserMessage,
    String? lastAssistantQuestion,
    bool? verseAccepted,
    String? selectedVerseId,
    int? riskLevel,
    bool? isEnded,
  }) {
    return ConversationSession(
      sessionId: sessionId,
      selectedEmotion: selectedEmotion,
      emotionIntensity: emotionIntensity,
      stage: stage ?? this.stage,
      turnCount: turnCount ?? this.turnCount,
      summary: summary ?? this.summary,
      lastUserMessage: lastUserMessage ?? this.lastUserMessage,
      lastAssistantQuestion:
          lastAssistantQuestion ?? this.lastAssistantQuestion,
      verseAccepted: verseAccepted ?? this.verseAccepted,
      selectedVerseId: selectedVerseId ?? this.selectedVerseId,
      riskLevel: riskLevel ?? this.riskLevel,
      isEnded: isEnded ?? this.isEnded,
    );
  }

  Map<String, dynamic> toJson() => {
        'sessionId': sessionId,
        'selectedEmotion': selectedEmotion.label,
        'emotionIntensity': emotionIntensity,
        'currentStage': stage.wireName,
        'turnCount': turnCount,
        'conversationSummary': summary,
        'previousUserAnswer': lastUserMessage,
        'previousAssistantQuestion': lastAssistantQuestion,
        'verseAccepted': verseAccepted,
        'selectedVerse': selectedVerseId,
        'riskLevel': riskLevel,
      };
}
