import '../src/safety/crisis_detector.dart';

/// Prefer examples authored together with the question. Older/offline responses
/// use intent-specific examples; unrelated stage fallbacks remain forbidden.
List<String> conversationQuestionExamples(
  String question, {
  List<String> answerExamples = const [],
  String userMessage = '',
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
  final supplied = answerExamples
      .map((value) => value.trim())
      .where((value) =>
          value.isNotEmpty &&
          value.length <= 60 &&
          !RegExp(r'[?？\n]|https?:|\d+\s*[:장절]').hasMatch(value) &&
          !const CrisisDetector().assess(value).isCrisis)
      .toSet()
      .take(3)
      .toList();
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
  if (supplied.isNotEmpty) return supplied;
  // Unrecognized explicit choices must never be answered with generic text.
  if (RegExp(r'중에서|중 무엇|중 어떤|중 어느|아니면').hasMatch(q)) {
    return const [];
  }
  // Match the actual question, including the app/server's alternate wording.
  // Time and memorable-moment questions need their own direct answers.
  if (RegExp(r'(마음|감정|기분).*(언제부터)|(언제부터).*(마음|감정|기분)').hasMatch(q)) {
    return const [
      '저는 오늘 아침부터 이런 마음이 들었어요.',
      '저는 며칠 전부터 조금씩 이런 기분이 들기 시작했어요.',
      '저는 최근에 여러 일이 겹치면서 이런 마음이 들었어요.',
    ];
  }
  if (RegExp(r'(상황|순간|마음|감정).*(언제였|언제 느|언제 가장)').hasMatch(q)) {
    return const [
      '저는 어제 혼자 집에 돌아왔을 때 그 마음이 가장 크게 느껴졌어요.',
      '저는 가까운 사람과 대화하던 순간에 그 마음이 크게 느껴졌어요.',
      '저는 오늘 해야 할 일을 생각할 때 그 마음이 가장 크게 느껴졌어요.',
    ];
  }
  // A scene question asks for a visual memory, not remembered words or needs.
  if (RegExp(r'장면.*(무엇|어떤)|(무엇|어떤)\s*장면').hasMatch(q) &&
      RegExp(r'마음에 남|기억에 남').hasMatch(q)) {
    if (!RegExp(r'노을|하늘|풍경|자연|햇빛|바다|산책').hasMatch(userMessage)) {
      return const [
        '저는 상대방의 표정이 가장 기억에 남아요.',
        '저는 그곳의 조용한 분위기가 가장 마음에 남아요.',
        '저는 잠시 멈춰 주변을 바라보던 장면이 기억에 남아요.',
      ];
    }
    return const [
      '저는 하늘이 붉게 물들던 장면이 가장 기억에 남아요.',
      '저는 빛이 주변 풍경에 은은하게 번지던 모습이 마음에 남아요.',
      '저는 잠시 멈춰 그 풍경을 바라보던 순간이 가장 기억에 남아요.',
    ];
  }
  if (RegExp(r'(마음에 남|기억에 남).*(무엇|어떤)|(무엇|어떤).*(마음에 남|기억에 남)').hasMatch(q)) {
    return const [
      '저는 상대방이 제게 했던 말이 가장 마음에 남아요.',
      '저는 제 마음을 제대로 표현하지 못한 순간이 기억에 남아요.',
      '저는 누군가 저를 챙겨 주었던 순간이 가장 마음에 남아요.',
    ];
  }
  if (RegExp(r'어떤 생각|무슨 생각|떠오른 생각|떠오르는 생각').hasMatch(q)) {
    return const [
      '저는 내가 또 잘못한 건 아닐까 생각했어요.',
      '저는 앞으로도 계속 힘들까 봐 걱정했어요.',
      '저는 누군가 제 마음을 이해해 주길 바랐어요.',
    ];
  }
  if (RegExp(r'누구.*(도움|이야기|연락|함께|의지)|(도움|이야기|연락|함께|의지).*누구').hasMatch(q)) {
    return const [
      '저는 제 이야기를 잘 들어 주는 친구가 떠올라요.',
      '저는 가까운 가족에게 이야기하고 싶어요.',
      '저는 믿을 수 있는 상담자에게 도움을 청하고 싶어요.'
    ];
  }
  if (RegExp(r'어디.*(쉬|편안|안정)|(쉬|편안|안정).*어디').hasMatch(q)) {
    return const [
      '저는 집의 조용한 공간에서 쉬고 싶어요.',
      '저는 가까운 공원에서 잠시 걷고 싶어요.',
      '저는 익숙하고 편안한 곳에 머물고 싶어요.'
    ];
  }
  if (RegExp(r'(몸|신체).*(어떤|어떻|느껴|느끼)|(어떤|어떻).*(몸|신체)').hasMatch(q)) {
    return const [
      '저는 어깨에 힘이 들어가 있어요.',
      '저는 가슴이 두근거리는 느낌이 들어요.',
      '저는 몸이 무겁고 기운이 없는 것 같아요.'
    ];
  }
  if (RegExp(r'(감사|고마).*(무엇|어떤|누구)|(무엇|어떤|누구).*(감사|고마)').hasMatch(q)) {
    return const [
      '저는 제 이야기를 들어 준 사람이 고마워요.',
      '저는 오늘 잠깐이라도 편히 쉴 수 있어 감사해요.',
      '저는 작은 일을 끝까지 해낸 제 자신에게 고마워요.'
    ];
  }
  if (RegExp(r'(걱정|두려|불안).*(무엇|어떤)|(무엇|어떤).*(걱정|두려|불안)').hasMatch(q)) {
    return const [
      '저는 기대한 만큼 해내지 못할까 봐 걱정돼요.',
      '저는 다른 사람에게 실망을 줄까 봐 두려워요.',
      '저는 앞으로 어떻게 될지 몰라 불안해요.'
    ];
  }
  if (RegExp(r'언제|어디|누구|몇|얼마나').hasMatch(q)) return const [];
  if (RegExp(r'(작은 행동|작은 실천|한 걸음).*(무엇|어떤)|(무엇|어떤).*(작은 행동|작은 실천|한 걸음)')
      .hasMatch(q)) {
    return const [
      '저는 잠시 멈추고 천천히 숨을 쉬어 볼게요.',
      '저는 지금 마음을 한 문장으로 적어 볼게요.',
      '저는 믿을 수 있는 사람에게 안부를 전해 볼게요.',
    ];
  }
  if (RegExp(r'무슨 일이|어떤 일이|어떤 상황|어떤 순간').hasMatch(q)) {
    return situationExamples;
  }
  if (RegExp(r'어떤 마음|어떤 감정|무슨 감정|(마음|감정|기분)(은|이)?\s*(어떤가|어떠|무엇)').hasMatch(q)) {
    return const [
      '저는 서운하고 슬픈 마음이 가장 컸어요.',
      '저는 불안하고 걱정되는 마음이 컸어요.',
      '저는 고맙고 따뜻한 마음이 들었어요.',
    ];
  }
  if (RegExp(r'(어떤|무엇).*(도움|위로)|(도움|위로).*(필요|무엇)|지금.*(필요한 것|필요하다고).*무엇')
      .hasMatch(q)) {
    return const [
      '지금은 그냥 위로받고 싶어요.',
      '저는 혼자가 아니라는 말을 듣고 싶어요.',
      '저는 힘든 일을 함께 정리해 줄 도움이 필요해요.',
    ];
  }
  return const [];
}
