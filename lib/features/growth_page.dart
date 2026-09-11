import 'package:flutter/material.dart';
import '../app/mind_card_store.dart';
import '../app/space_scaffold.dart';
import '../engagement/engagement_controller.dart';
import '../engagement/notifications/notification_settings_page.dart';
import 'saved_cards_page.dart';

/// Growth is a view of saved cards, so deletion also removes the related record.
class GrowthPage extends StatefulWidget {
  const GrowthPage({super.key, this.store});
  final MindCardStore? store;
  @override
  State<GrowthPage> createState() => _GrowthPageState();
}

class _GrowthPageState extends State<GrowthPage> {
  late final _store = widget.store ?? MindCardStore();
  late Future<List<MindCardRecord>> _records = _store.getAll();
  void _reload() => setState(() => _records = _store.getAll());

  @override
  Widget build(BuildContext context) => SpaceScaffold(
        appBar: AppBar(title: const Text('작은 성장 기록')),
        body: FutureBuilder<List<MindCardRecord>>(
          future: _records,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('기록을 불러오지 못했어요.'),
                TextButton(onPressed: _reload, child: const Text('다시 불러오기')),
              ]));
            }
            final cards = snapshot.data ?? [];
            return ListView(padding: const EdgeInsets.all(24), children: [
              const Text('나를 돌본 시간이 남았어요.',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              const Text('하루를 건너뛰어도 괜찮아요. 저장한 마음카드 속 작은 행동을 천천히 돌아보세요.'),
              const SizedBox(height: 20),
              if (EngagementScope.maybeOf(context) != null) ...[
                FilledButton.icon(
                    icon: const Icon(Icons.notifications_none),
                    onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => const NotificationSettingsPage(
                                startTomorrow: true))),
                    label: const Text('다음날 알림 설정하기')),
                const SizedBox(height: 8),
                const Text('원하는 시간을 골라 켜면 내일부터 조용히 알려드려요.'),
              ],
              TextButton(
                  onPressed: () async {
                    await Navigator.of(context).push(MaterialPageRoute<void>(
                        builder: (_) => SavedCardsPage(store: _store)));
                    if (mounted) _reload();
                  },
                  child: const Text('저장한 카드 보기 / 공유')),
              const SizedBox(height: 16),
              if (cards.isEmpty) const Text('마음카드를 저장하면 작은 성장 기록이 이곳에 남아요.'),
              for (final card in cards)
                Card(
                    child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(card.dateLabel,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.bold)),
                              const SizedBox(height: 8),
                              const Text('내가 고른 작은 행동'),
                              Text(card.action),
                              if (card.verseReference.isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Text(card.verseReference),
                              ],
                            ]))),
              const SizedBox(height: 12),
              OutlinedButton(
                  onPressed: () =>
                      Navigator.of(context).popUntil((route) => route.isFirst),
                  child: const Text('오늘은 여기까지')),
            ]);
          },
        ),
      );
}
