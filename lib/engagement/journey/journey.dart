String calendarDay(DateTime time) => '${time.year}-${time.month.toString().padLeft(2, '0')}-${time.day.toString().padLeft(2, '0')}';

const journeyMoods = ['가벼워요', '차분해요', '복잡해요', '쉬고 싶어요'];
const journeyActions = [
  '편안히 앉아 천천히 세 번 숨 쉬기', '물 한 잔을 천천히 마시기', '창밖의 빛을 잠시 바라보기',
  '고마웠던 작은 순간 하나 떠올리기', '나에게 다정한 말 한마디 건네기', '소중한 사람에게 안부 전하기',
  '지금까지 나를 돌본 시간을 가만히 기억하기',
];

class JourneyCheckin {
  const JourneyCheckin({required this.day, required this.date, required this.mood,
    required this.note, required this.verseId, required this.action});
  final int day;
  final String date, mood, note, verseId, action;
  Map<String, Object> toJson() => {'day': day, 'date': date, 'mood': mood, 'note': note, 'verseId': verseId, 'action': action};
  factory JourneyCheckin.fromJson(Map<String, dynamic> json) => JourneyCheckin(
    day: json['day'] as int, date: json['date'] as String, mood: json['mood'] as String,
    note: json['note'] as String, verseId: json['verseId'] as String, action: json['action'] as String);
}

class SevenDayJourney {
  SevenDayJourney({required this.journeyId, required this.startedAt, List<JourneyCheckin> checkins = const [], this.completedAt})
      : checkins = List.unmodifiable(checkins) {
    if (checkins.length > 7 || checkins.indexed.any((r) => r.$2.day != r.$1 + 1)
        || checkins.any((r) => !journeyMoods.contains(r.mood) || r.note.length > 120)
        || checkins.map((r) => r.date).toSet().length != checkins.length) {
      throw const FormatException('Invalid journey data');
    }
  }
  final String journeyId;
  final DateTime startedAt;
  final DateTime? completedAt;
  final List<JourneyCheckin> checkins;
  bool get complete => checkins.length == 7;
  int get currentDay => complete ? 7 : checkins.length + 1;
  List<int> get completedDays => checkins.map((c) => c.day).toList();
  List<String> get savedVerseIds => checkins.map((c) => c.verseId).toSet().toList();
  bool canComplete(DateTime now) => !complete && (checkins.isEmpty || calendarDay(now).compareTo(checkins.last.date) > 0);
  SevenDayJourney finishDay({required DateTime now, required String mood, required String note, required String verseId}) {
    if (!canComplete(now) || !journeyMoods.contains(mood) || note.trim().isEmpty || note.length > 120) {
      throw StateError('This day cannot be completed');
    }
    return SevenDayJourney(journeyId: journeyId, startedAt: startedAt,
      checkins: [...checkins, JourneyCheckin(day: currentDay, date: calendarDay(now), mood: mood,
        note: note.trim(), verseId: verseId, action: journeyActions[currentDay - 1])],
      completedAt: currentDay == 7 ? now : null);
  }
  Map<String, Object?> toJson() => {'journeyId': journeyId, 'startedAt': startedAt.toIso8601String(),
    'currentDay': currentDay, 'completedDays': completedDays, 'checkins': checkins.map((c) => c.toJson()).toList(),
    'savedVerseIds': savedVerseIds, 'completedAt': completedAt?.toIso8601String()};
  factory SevenDayJourney.fromJson(Map<String, dynamic> json) => SevenDayJourney(
    journeyId: json['journeyId'] as String, startedAt: DateTime.parse(json['startedAt'] as String),
    checkins: (json['checkins'] as List).map((v) => JourneyCheckin.fromJson(Map<String, dynamic>.from(v as Map))).toList(),
    completedAt: DateTime.tryParse(json['completedAt'] as String? ?? ''));
}
