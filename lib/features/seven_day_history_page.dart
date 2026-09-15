import 'package:flutter/material.dart';
import '../app/mind_card_store.dart';
import '../app/seven_day_history.dart';
import '../app/space_scaffold.dart';

class SevenDayHistoryPage extends StatefulWidget {
  const SevenDayHistoryPage({super.key, this.store, this.clock});
  final MindCardStore? store;
  final DateTime Function()? clock;
  @override
  State<SevenDayHistoryPage> createState() => _SevenDayHistoryPageState();
}

class _SevenDayHistoryPageState extends State<SevenDayHistoryPage> {
  late final _store = widget.store ?? MindCardStore();
  late Future<List<MindCardRecord>> _records = _store.getAll();
  @override
  Widget build(BuildContext context) => SpaceScaffold(
        appBar: AppBar(title: const Text('최근 7일 마음 기록')),
        body: FutureBuilder<List<MindCardRecord>>(
          future: _records,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('기록을 불러오지 못했어요.'),
                TextButton(
                    onPressed: () => setState(() => _records = _store.getAll()),
                    child: const Text('다시 시도')),
              ]));
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final days = sevenDayHistory(
                snapshot.data!, (widget.clock ?? DateTime.now)());
            final entries = days.expand((day) => day.cards).toList();
            final emotions = <String, int>{};
            for (final card in entries) {
              emotions.update(card.emotion, (count) => count + 1,
                  ifAbsent: () => 1);
            }
            final ranked = emotions.entries.toList()
              ..sort((a, b) => b.value.compareTo(a.value));
            return ListView(padding: const EdgeInsets.all(20), children: [
              const Text('나의 일주일 돌아보기',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              Text(
                  '마음카드 ${entries.length}개 · 해봤다고 기록한 실천 ${entries.where((c) => c.actionReview == 'done').length}개'),
              if (ranked.isNotEmpty)
                Text(
                    '기록한 감정: ${ranked.map((e) => '${e.key} ${e.value}회').join(' · ')}'),
              const Text('이 기기에 저장한 카드만 집계해요. 기록하지 않은 날의 마음은 추정하지 않아요.'),
              const Text('저장한 마음카드의 감정과 선택한 작은 행동이에요. 강도는 기록한 순서로 표시해요.'),
              const Text('감정마다 강도의 의미는 다를 수 있어요. 진단이나 치료 효과를 평가하는 기록이 아니에요.'),
              if (entries.length > 1)
                Text(
                    '7일 기록 순 강도: ${entries.map((card) => '${card.intensity}/10').join(' → ')}'),
              if (days.every((day) => day.cards.isEmpty))
                const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text('최근 7일 동안 저장한 마음 기록이 없어요.')),
              for (final day in days)
                Card(
                    child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('${day.date.month}월 ${day.date.day}일',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold)),
                              if (day.cards.isEmpty) const Text('저장한 기록이 없어요.'),
                              for (final card in day.cards)
                                Padding(
                                    padding: const EdgeInsets.only(top: 8),
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                              '${card.emotion} · ${card.intensity}/10\n선택한 작은 행동: ${card.action}'),
                                          if (card.verseReference.isNotEmpty)
                                            Text(
                                                '함께한 말씀: ${card.verseReference}'),
                                          Text(card.reviewLabel),
                                          if (card.replacementAction != null)
                                            Text(
                                                '새로 고른 실천: ${card.replacementAction}'),
                                        ])),
                              if (day.cards.length > 1)
                                Text(
                                    '기록 순 강도: ${day.cards.map((card) => '${card.intensity}/10').join(' → ')}'),
                            ]))),
            ]);
          },
        ),
      );
}
