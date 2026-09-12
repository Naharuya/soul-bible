import 'crisis_models.dart';

class CrisisDetector {
  const CrisisDetector();

  CrisisAssessment assess(String rawText) {
    final text = _normalize(rawText);
    if (text.isEmpty) return CrisisAssessment.safe;

    final medical = _matchesAny(text, _medicalEmergencyPatterns);
    if (medical.isNotEmpty) {
      return CrisisAssessment(
        level: 3,
        kind: CrisisKind.medicalEmergency,
        reasons: medical,
        requiresImmediateUi: true,
      );
    }

    final violence = _matchesAny(text, _violencePatterns);
    final plan = _matchesAny(text, _planPatterns);
    final means = _matchesAny(text, _meansPatterns);
    final time = _matchesAny(text, _timePatterns);

    if (violence.isNotEmpty) {
      final imminent = plan.isNotEmpty || means.isNotEmpty || time.isNotEmpty;
      return CrisisAssessment(
        level: imminent ? 3 : 2,
        kind: CrisisKind.violence,
        reasons: [...violence, ...plan, ...means, ...time],
        requiresImmediateUi: imminent,
      );
    }

    final activeSelfHarm = _matchesAny(text, _activeSelfHarmPatterns);
    if (activeSelfHarm.isNotEmpty) {
      final imminent = plan.isNotEmpty || means.isNotEmpty || time.isNotEmpty;
      return CrisisAssessment(
        level: imminent ? 3 : 2,
        kind: imminent
            ? CrisisKind.imminentSelfHarm
            : CrisisKind.activeSelfHarm,
        reasons: [...activeSelfHarm, ...plan, ...means, ...time],
        requiresImmediateUi: imminent,
      );
    }

    final passive = _matchesAny(text, _passiveSelfHarmPatterns);
    if (passive.isNotEmpty) {
      return CrisisAssessment(
        level: 1,
        kind: CrisisKind.passiveSelfHarm,
        reasons: passive,
        requiresImmediateUi: false,
      );
    }

    final psychosis = _matchesAny(text, _psychosisPatterns);
    if (psychosis.isNotEmpty) {
      return CrisisAssessment(
        level: 1,
        kind: CrisisKind.psychosis,
        reasons: psychosis,
        requiresImmediateUi: false,
      );
    }

    return CrisisAssessment.safe;
  }

  static String _normalize(String text) => text
      .toLowerCase()
      .replaceAll(RegExp(r'[^\w가-힣]'), '')
      .trim();

  static List<String> _matchesAny(String text, List<RegExp> patterns) {
    return patterns
        .where((pattern) => RegExp(pattern.pattern.replaceAll(' ', '')).hasMatch(text))
        .map((pattern) => pattern.pattern)
        .toList(growable: false);
  }

  static final _passiveSelfHarmPatterns = <RegExp>[
    RegExp(r'사라지고 싶'),
    RegExp(r'눈을 뜨지 않았으면'),
    RegExp(r'사는 의미가 없'),
    RegExp(r'살 이유가 없'),
    RegExp(r'모든 걸 포기하고 싶'),
    RegExp(r'없어졌으면 좋겠'),
  ];

  static final _activeSelfHarmPatterns = <RegExp>[
    RegExp(r'죽고 싶'),
    RegExp(r'자살하고 싶'),
    RegExp(r'목숨을 끊'),
    RegExp(r'나를 해치'),
    RegExp(r'자해하고 싶'),
    RegExp(r'끝내 버리고 싶'),
    RegExp(r'자(?:해|살)(?:할|하려는|하려고)(?:생각|계획|마음|해)'),
  ];

  static final _planPatterns = <RegExp>[
    RegExp(r'계획을 세웠'),
    RegExp(r'자(?:해|살)(?:할|하려는)(?:생각과)?계획'),
    RegExp(r'방법을 정했'),
    RegExp(r'유서를'),
    RegExp(r'준비해 뒀'),
    RegExp(r'실행할'),
  ];

  // Do not add detailed method names. Keep this deliberately broad.
  static final _meansPatterns = <RegExp>[
    RegExp(r'도구를 준비'),
    RegExp(r'위험한 물건'),
    RegExp(r'수단이 있'),
    RegExp(r'이미 준비'),
  ];

  static final _timePatterns = <RegExp>[
    RegExp(r'오늘 밤'),
    RegExp(r'지금 당장'),
    RegExp(r'오늘 하'),
    RegExp(r'곧 실행'),
    RegExp(r'몇 시에'),
  ];

  static final _violencePatterns = <RegExp>[
    RegExp(r'죽이고 싶'),
    RegExp(r'해치고 싶'),
    RegExp(r'복수하고 싶'),
    RegExp(r'다치게 하'),
    RegExp(r'공격하고 싶'),
  ];

  static final _psychosisPatterns = <RegExp>[
    RegExp(r'생각을 읽고 있'),
    RegExp(r'누가 나를 감시'),
    RegExp(r'목소리가 시켜'),
    RegExp(r'환청'),
    RegExp(r'내 머릿속에 말'),
  ];

  static final _medicalEmergencyPatterns = <RegExp>[
    RegExp(r'가슴이 너무 아프'),
    RegExp(r'숨을 못 쉬'),
    RegExp(r'의식을 잃'),
    RegExp(r'심한 출혈'),
    RegExp(r'약을 너무 많이 먹'),
  ];
}
