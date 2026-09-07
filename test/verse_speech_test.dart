import 'dart:convert';
import 'dart:io';

import 'package:bible_mind_core/src/verses/verse_models.dart';
import 'package:flutter_test/flutter_test.dart';

BibleVerse verse(String book, int chapter, int start, [int? end]) => BibleVerse(
      id: 'test',
      book: book,
      chapter: chapter,
      verseStart: start,
      verseEnd: end,
      reference: '$book $chapter:$start${end == null ? '' : '-$end'}',
      translation: '',
      text: '',
      englishText: '',
      emotions: [],
      tags: [],
      reflectionQuestion: '',
    );

void main() {
  test(
      'Korean speech expands chapter and verse ranges without changing display',
      () {
    final passage = verse('빌립보서', 4, 6, 7);
    expect(passage.koreanSpokenReference, '빌립보서 사장 육절부터 칠절까지');
    expect(passage.reference, '빌립보서 4:6-7');
  });
  test('single verses and equal endpoints are read once', () {
    expect(verse('잠언', 15, 1).koreanSpokenReference, '잠언 십오장 일절');
    expect(verse('이사야', 41, 10, 10).koreanSpokenReference, '이사야 사십일장 십절');
  });
  test('Psalms use 편 and large numbers use Sino-Korean pronunciation', () {
    expect(verse('시편', 119, 105).koreanSpokenReference, '시편 백십구편 백오절');
    expect(verse('시편', 100, 4).koreanSpokenReference, '시편 백편 사절');
  });
  test('every bundled passage has an unambiguous Korean spoken reference', () {
    final data =
        jsonDecode(File('assets/data/bible_verses_ko.json').readAsStringSync())
            as Map<String, dynamic>;
    for (final json in data['verses'] as List) {
      final passage = BibleVerse.fromJson(json as Map<String, dynamic>);
      expect(passage.koreanSpokenReference, startsWith(passage.book));
      expect(
          passage.koreanSpokenReference, isNot(matches(RegExp(r'[0-9:\-]'))));
      expect(passage.koreanSpokenReference, contains('절'));
    }
  });
}
