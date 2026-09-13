import 'package:onaria/onaria.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/features/conversation_question_examples.dart';

void main() {
  test('response decoding tolerates absent or malformed optional examples', () {
    const original = LlmConversationResponse(
        message: '마음을 살펴볼게요.',
        question: '어떤 색이 떠오르나요?',
        stage: ConversationStage.thought,
        detectedEmotion: EmotionType.admiration,
        riskLevel: 0,
        shouldOfferVerse: false,
        shouldEndConversation: false);
    final payload = original.toJson();
    expect(LlmConversationResponse.fromJson(payload).answerExamples, isEmpty);
    payload['answerExamples'] = ['저는 파란색이 떠올라요.', 123];
    expect(LlmConversationResponse.fromJson(payload).answerExamples,
        ['저는 파란색이 떠올라요.']);
    payload['answerExamples'] = 'bad';
    expect(LlmConversationResponse.fromJson(payload).message, original.message);
    expect(LlmConversationResponse.fromJson(payload).answerExamples, isEmpty);
  });
  test('screenshot scene question offers scene descriptions', () {
    for (final question in [
      '그 순간 가장 오래 마음에 남은 장면은 무엇이었나요?',
      '어떤 장면이 가장 기억에 남았나요?',
    ]) {
      expect(
          conversationQuestionExamples(question,
              userMessage: '아름다운 노을을 보며 감탄했어요.'),
          [
            '저는 하늘이 붉게 물들던 장면이 가장 기억에 남아요.',
            '저는 빛이 주변 풍경에 은은하게 번지던 모습이 마음에 남아요.',
            '저는 잠시 멈춰 그 풍경을 바라보던 순간이 가장 기억에 남아요.',
          ]);
    }
  });
  test('new question wording uses examples returned with that exact question',
      () {
    expect(
        conversationQuestionExamples('지금 마음을 색으로 표현한다면요?',
            answerExamples: ['저는 차분한 파란색이 떠올라요.', '저는 따뜻한 노란색이 떠올라요.']),
        ['저는 차분한 파란색이 떠올라요.', '저는 따뜻한 노란색이 떠올라요.']);
    expect(conversationQuestionExamples('', answerExamples: ['저는 쉬고 싶어요.']),
        isEmpty);
    expect(
        conversationQuestionExamples('지금 마음을 색으로 표현한다면요?',
            answerExamples: ['저는 죽고 싶어요.', '어떤 색인가요?', '']),
        isEmpty);
  });
  test('offline scene examples follow the user context', () {
    final examples = conversationQuestionExamples('어떤 장면이 가장 기억에 남았나요?',
        userMessage: '친구가 제게 웃어 주었어요.');
    expect(examples.first, contains('표정'));
    expect(examples.join(), isNot(contains('하늘')));
  });
  test(
      'offline person, place, body and gratitude questions have direct answers',
      () {
    for (final question in [
      '누구에게 이야기를 하고 싶나요?',
      '어디에서 편안하게 쉬고 싶나요?',
      '몸에서 어떤 느낌이 느껴지나요?',
      '오늘 무엇이 가장 고마웠나요?',
      '무엇이 가장 걱정되나요?'
    ]) {
      expect(conversationQuestionExamples(question), hasLength(3),
          reason: question);
    }
  });
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
      '언제부터 이 일을 시작했나요?',
      '어떤 상황에서 몇 명이 있었나요?',
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
  test('app and server question variants have direct first-person answers', () {
    const questions = {
      '그 마음이 가장 크게 느껴진 상황은 언제였나요?': '집에 돌아왔을 때',
      '언제부터 이런 마음이 들었나요?': '오늘 아침부터',
      '“설레지만 걱정돼요”라는 마음과 관련해, 방금 이야기한 상황에서 가장 마음에 남는 것은 무엇인가요?': '상대방이 제게 했던 말',
      '지금 바로 할 수 있는 작은 행동 한 가지는 무엇일까요?': '숨을 쉬어 볼게요',
      '지금 자신을 위해 할 수 있는 작은 행동은 무엇일까요?': '숨을 쉬어 볼게요',
      '지금 기분은 어떤가요?': '마음이 가장 컸어요',
      '지금 가장 필요한 것은 무엇인가요?': '위로받고 싶어요',
    };
    for (final entry in questions.entries) {
      final examples = conversationQuestionExamples(entry.key);
      expect(examples, hasLength(3), reason: entry.key);
      expect(examples.first, contains(entry.value), reason: entry.key);
    }
  });
}
