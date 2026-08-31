import 'package:bible_mind_core/bible_mind_core.dart';
import 'package:test/test.dart';

void main() {
  const detector = CrisisDetector();

  test('일반적인 불안은 위기로 분류하지 않는다', () {
    final result = detector.assess('내일 발표가 너무 불안해요.');
    expect(result.level, 0);
  });

  test('소극적 죽음 표현은 level 1이다', () {
    final result = detector.assess('그냥 사라지고 싶어요.');
    expect(result.level, 1);
    expect(result.kind, CrisisKind.passiveSelfHarm);
  });

  test('적극적 자해 표현은 level 2이다', () {
    final result = detector.assess('죽고 싶다는 생각이 들어요.');
    expect(result.level, 2);
  });

  test('구체적 시간 표현이 함께 있으면 level 3이다', () {
    final result = detector.assess('죽고 싶고 오늘 밤 실행할 생각이에요.');
    expect(result.level, 3);
    expect(result.requiresImmediateUi, isTrue);
  });

  test('타해 표현을 감지한다', () {
    final result = detector.assess('그 사람을 해치고 싶어요.');
    expect(result.level, 2);
    expect(result.kind, CrisisKind.violence);
  });
}
