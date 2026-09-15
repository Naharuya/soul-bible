import 'package:flutter/material.dart';
import '../app/mind_card_store.dart';
import '../app/space_scaffold.dart';
import '../app/responsive_text.dart';
import '../engagement/engagement_controller.dart';
import '../engagement/notifications/notification_settings_page.dart';
import 'saved_cards_page.dart';
import '../engagement/safety_notice.dart';
import '../engagement/mini_games/cross_light/cross_light_page.dart';

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
  bool _reviewing = false;

  Future<void> _review(MindCardRecord card, String status) async {
    if (_reviewing) return;
    setState(() => _reviewing = true);
    try {
      String? replacement;
      if (status == 'changed') {
        replacement = await showModalBottomSheet<String>(
            context: context,
            useSafeArea: true,
            showDragHandle: true,
            builder: (context) => ListView(shrinkWrap: true, children: [
                  const ListTile(title: Text('지금 가능한 작은 실천으로 바꿔요')),
                  for (final action in ['물 한 잔 마시기', '편안하게 세 번 호흡하기', '잠시 쉬기'])
                    ListTile(
                        title: Text(action),
                        onTap: () => Navigator.pop(context, action)),
                ]));
        if (replacement == null || !mounted) return;
      }
      if (EngagementScope.maybeOf(context)?.safetyBlocked == true) return;
      await _store.reviewAction(card.id, status, replacement: replacement);
      if (mounted) _reload();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('실천 기록을 저장하지 못했어요. 다시 시도해 주세요.')));
      }
    } finally {
      if (mounted) setState(() => _reviewing = false);
    }
  }

  @override
  Widget build(BuildContext context) => SpaceScaffold(
        appBar: AppBar(
            title: const ResponsiveText('작은 성장 기록',
                minFontSize: 18, maxFontSize: 22)),
        bottomBar: OutlinedButton(
          key: const ValueKey('growth-finish'),
          onPressed: () =>
              Navigator.of(context).popUntil((route) => route.isFirst),
          child: const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: ResponsiveText('오늘은 여기까지',
                  minFontSize: 15,
                  maxFontSize: 17,
                  textAlign: TextAlign.center)),
        ),
        body: EngagementScope.maybeOf(context)?.safetyBlocked == true
            ? const SafetyNotice()
            : FutureBuilder<List<MindCardRecord>>(
                future: _records,
                builder: (context, snapshot) {
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  if (snapshot.hasError) {
                    return Center(
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                      const Text('기록을 불러오지 못했어요.'),
                      TextButton(
                          onPressed: _reload, child: const Text('다시 불러오기')),
                    ]));
                  }
                  final cards = snapshot.data ?? [];
                  return ListView(padding: const EdgeInsets.all(24), children: [
                    const Text('나를 돌본 시간이 남았어요.',
                        style: TextStyle(
                            fontSize: 24, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    const Text('하루를 건너뛰어도 괜찮아요. 저장한 마음카드 속 작은 행동을 천천히 돌아보세요.'),
                    const SizedBox(height: 20),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute(
                              builder: (_) => const CrossLightPage())),
                      icon: const Icon(Icons.auto_awesome),
                      label: const Text('원하면 빛 모으기 게임하기'),
                    ),
                    if (EngagementScope.maybeOf(context) != null) ...[
                      FilledButton.icon(
                          icon: const Icon(Icons.notifications_none),
                          onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                  builder: (_) =>
                                      const NotificationSettingsPage(
                                          startTomorrow: true))),
                          label: const Text('다음날 알림 설정하기')),
                      const SizedBox(height: 8),
                      const ResponsiveText('원하는 시간을 골라 켜면 내일부터 조용히 알려드려요.',
                          preferredWrap: '원하는 시간을 골라 켜면\n내일부터 조용히 알려드려요.',
                          minFontSize: 13,
                          maxFontSize: 15),
                    ],
                    TextButton(
                        onPressed: () async {
                          await Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                  builder: (_) =>
                                      SavedCardsPage(store: _store)));
                          if (mounted) _reload();
                        },
                        child: const Text('저장한 카드 보기 / 공유')),
                    const SizedBox(height: 16),
                    if (cards.isEmpty)
                      const Text('마음카드를 저장하면 작은 성장 기록이 이곳에 남아요.'),
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
                                    const SizedBox(height: 8),
                                    Text(card.reviewLabel),
                                    if (card.replacementAction != null)
                                      Text(
                                          '새로 고른 실천: ${card.replacementAction}'),
                                    if (card.createdAt.toLocal().isBefore(
                                        DateUtils.dateOnly(DateTime.now())))
                                      const Text(
                                          '지난번의 작은 실천, 어땠나요? 하지 못했어도 괜찮아요.'),
                                    Wrap(spacing: 8, children: [
                                      for (final option in [
                                        ('done', '해봤어요'),
                                        ('later', '아직이에요'),
                                        ('changed', '바꿀래요')
                                      ])
                                        OutlinedButton(
                                            onPressed: _reviewing
                                                ? null
                                                : () =>
                                                    _review(card, option.$1),
                                            child: Text(option.$2)),
                                    ]),
                                    if (card.verseReference.isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      Text(card.verseReference),
                                    ],
                                  ]))),
                    const SizedBox(height: 12),
                  ]);
                },
              ),
      );
}
