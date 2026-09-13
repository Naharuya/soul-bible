/// Only offer answers for a question whose intent we recognize. Unknown
/// questions deliberately have no suggestions, rather than stage fallbacks.
List<String> conversationQuestionExamples(
  String question, {
  List<String> situationExamples = const [],
}) {
  // Ignore preceding statements so their vocabulary cannot choose the answers.
  final q = question
          .split(RegExp(r'[.。!！?？]'))
          .where((part) => part.trim().isNotEmpty)
          .lastOrNull
          ?.replaceAll(RegExp(r'\s+'), ' ')
          .trim() ??
      '';
  if (q.isEmpty) return const [];
  const choices = {
    '위로': '지금은 그냥 위로받고 싶어요.',
    '이해': '제 마음을 누군가 알아줬으면 좋겠어요.',
    '쉼': '아무 생각 없이 잠시 쉬고 싶어요.',
    '용기': '다시 움직일 수 있는 용기가 필요해요.',
  };
  final offered = choices.keys.where(q.contains).toList();
  if (offered.length >= 2 && RegExp(r'중.*(무엇|어떤|어느|가까)').hasMatch(q)) {
    offered.sort((a, b) => q.indexOf(a).compareTo(q.indexOf(b)));
    return offered.map((word) => choices[word]!).toList();
  }
  // Unrecognized explicit choices must never be answered with generic text.
  if (RegExp(r'중에서|중 무엇|중 어떤|중 어느|아니면').hasMatch(q)) {
    return const [];
  }
  if (RegExp(r'어떤 생각|무슨 생각|떠오른 생각|떠오르는 생각').hasMatch(q)) {
    return const [
      '저는 내가 또 잘못한 건 아닐까 생각했어요.',
      '저는 앞으로도 계속 힘들까 봐 걱정했어요.',
      '저는 누군가 제 마음을 이해해 주길 바랐어요.',
    ];
  }
  if (RegExp(r'언제|어디|누구|몇|얼마나').hasMatch(q)) return const [];
  if (RegExp(r'무슨 일이|어떤 일이|어떤 상황|어떤 순간').hasMatch(q)) {
    return situationExamples;
  }
  if (RegExp(r'어떤 마음|어떤 감정|무슨 감정').hasMatch(q)) {
    return const [
      '저는 서운하고 슬픈 마음이 가장 컸어요.',
      '저는 불안하고 걱정되는 마음이 컸어요.',
      '저는 고맙고 따뜻한 마음이 들었어요.',
    ];
  }
  if (RegExp(r'(어떤|무엇).*(도움|위로)|(도움|위로).*(필요|무엇)').hasMatch(q)) {
    return const [
      '지금은 그냥 위로받고 싶어요.',
      '저는 혼자가 아니라는 말을 듣고 싶어요.',
      '저는 힘든 일을 함께 정리해 줄 도움이 필요해요.',
    ];
  }
  return const [];
}
