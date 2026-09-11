import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/mind_card_store.dart';
import 'package:onaria/features/saved_cards_page.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

MindCardRecord _card() => MindCardRecord(
    id: 'card-1',
    createdAt: DateTime(2026, 9, 11),
    title: '오늘의 마음 카드',
    dateLabel: '2026년 9월 11일',
    emotion: '차분함',
    intensity: 5,
    verseReference: '시편 1:1',
    verseText: 'test',
    reflectionQuestion: 'test',
    action: 'test',
    closingMessage: 'test');

class _FaultyStore extends MindCardStore {
  bool failRead = true;
  @override
  Future<List<MindCardRecord>> getAll() async {
    if (failRead) throw StateError('test read failure');
    return [_card()];
  }

  @override
  Future<void> delete(String id) async =>
      throw StateError('test delete failure');
}

void main() {
  setUp(() => SharedPreferencesAsyncPlatform.instance =
      InMemorySharedPreferencesAsync.empty());
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);

  testWidgets(
      'swipe delete cancellation keeps the card, confirmation removes it from storage and list',
      (tester) async {
    final store = MindCardStore();
    await store.save(_card());
    await tester.pumpWidget(MaterialApp(home: SavedCardsPage(store: store)));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Dismissible), const Offset(-600, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('취소'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('card-1')), findsOneWidget);
    await tester.drag(find.byType(Dismissible), const Offset(-600, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.text('삭제'));
    await tester.pumpAndSettle();
    expect(find.text('아직 저장된 카드가 없어요.'), findsOneWidget);
    expect(await store.getAll(), isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('read retry works and failed button deletion preserves the card',
      (tester) async {
    final store = _FaultyStore();
    await tester.pumpWidget(MaterialApp(home: SavedCardsPage(store: store)));
    await tester.pumpAndSettle();
    expect(find.text('카드를 불러오지 못했어요.'), findsOneWidget);
    store.failRead = false;
    await tester.tap(find.text('다시 시도'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('카드 삭제'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('삭제'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('card-1')), findsOneWidget);
    expect(find.text('삭제하지 못했어요. 다시 시도해 주세요.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
