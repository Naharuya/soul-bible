import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/features/conversation_question_examples.dart';

void main() {
  test('explicit need choices are answered in question order', () {
    expect(
        conversationQuestionExamples(
            '지금 가장 필요하다고 느끼는 것은 위로, 이해, 쉼, 용기 중 무엇에 가까운가요?'),
        [
          '지금은 그냥 위로받고 싶어요.',
          '제 마음을 누군가 알아줬으면 좋겠어요.',
          '아무 생각 없이 잠시 쉬고 싶어요.',
          '다시 움직일 수 있는 용기가 필요해요.',
        ]);
    expect(conversationQuestionExamples('쉼과 위로 중 무엇이 필요한가요?'), [
      '아무 생각 없이 잠시 쉬고 싶어요.',
      '지금은 그냥 위로받고 싶어요.',
    ]);
  });
  test('unknown questions and choices never use situation fallbacks', () {
    for (final question in ['', '내일 몇 시에 만나나요?', '차와 커피 중 무엇이 필요한가요?']) {
      expect(
          conversationQuestionExamples(question,
              situationExamples: ['저는 슬펐어요.']),
          isEmpty);
    }
  });
  test('context words and timing questions do not select unrelated examples',
      () {
    for (final question in [
      '언제부터 이런 마음이 들었나요?',
      '어떤 상황에서 누구에게 도움을 청하고 싶나요?',
      '위로와 이해가 필요하셨군요. 내일 무엇을 하고 싶나요?',
      '위로와 이해를 받았을 때 어떤 생각이 들었나요?',
    ]) {
      final examples = conversationQuestionExamples(question,
          situationExamples: ['저는 가족과 다퉜어요.']);
      if (question.contains('어떤 생각')) {
        expect(examples.first, '저는 내가 또 잘못한 건 아닐까 생각했어요.');
      } else {
        expect(examples, isEmpty);
      }
    }
  });
  test('situation, thought, emotion and need questions select direct answers',
      () {
    expect(
        conversationQuestionExamples('무슨 일이 있었나요?',
            situationExamples: ['저는 가족과 다퉜어요.']),
        ['저는 가족과 다퉜어요.']);
    expect(conversationQuestionExamples('그때 어떤 생각이 들었나요?').first,
        '저는 내가 또 잘못한 건 아닐까 생각했어요.');
    expect(conversationQuestionExamples('어떤 마음이 가장 크게 느껴졌나요?').first,
        contains('마음이'));
    expect(conversationQuestionExamples('지금 어떤 도움이 필요하신가요?'), isNotEmpty);
  });
}
