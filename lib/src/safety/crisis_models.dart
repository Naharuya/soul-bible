enum CrisisKind {
  none,
  passiveSelfHarm,
  activeSelfHarm,
  imminentSelfHarm,
  violence,
  psychosis,
  medicalEmergency,
}

class CrisisAssessment {
  const CrisisAssessment({
    required this.level,
    required this.kind,
    required this.reasons,
    required this.requiresImmediateUi,
  });

  final int level;
  final CrisisKind kind;
  final List<String> reasons;
  final bool requiresImmediateUi;

  bool get isCrisis => level > 0;

  static const safe = CrisisAssessment(
    level: 0,
    kind: CrisisKind.none,
    reasons: [],
    requiresImmediateUi: false,
  );
}
