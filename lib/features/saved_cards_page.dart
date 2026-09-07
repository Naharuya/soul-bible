import 'package:flutter/material.dart';
import '../app/mind_card_store.dart';
import '../app/app_theme.dart';
import '../app/space_scaffold.dart';

class SavedCardsPage extends StatelessWidget {
  const SavedCardsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final store = MindCardStore();

    return SpaceScaffold(
      appBar: AppBar(
        title: const Text('저장된 마음 카드', style: TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: FutureBuilder<List<MindCardRecord>>(
        future: store.getAll(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData || snapshot.data!.isEmpty) {
            return Center(
              child: Text('아직 저장된 카드가 없어요.', style: TextStyle(color: AppTheme.of(context).muted)),
            );
          }

          final cards = snapshot.data!;
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: cards.length,
            itemBuilder: (context, index) {
              final card = cards[index];
              return Dismissible(
                key: ValueKey(card.id),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 24),
                  color: const Color(0xFF452338),
                  child: Icon(Icons.delete_outline, color: AppTheme.of(context).coral),
                ),
                confirmDismiss: (_) => _confirmDelete(context, store, card),
                child: Card(
                margin: const EdgeInsets.only(bottom: 16),
                child: InkWell(
                  onTap: () => _showDetails(context, card),
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${card.dateLabel} · ${_agentLabel(card.agent)}', style: TextStyle(fontSize: 13, color: AppTheme.of(context).green, fontWeight: FontWeight.w700)),
                            Icon(Icons.chevron_right, size: 20, color: AppTheme.of(context).muted),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('${card.emotion} · ${card.intensity}/10', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text(card.verseReference, style: TextStyle(color: AppTheme.of(context).muted)),
                      ],
                    ),
                  ),
                ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Future<bool> _confirmDelete(BuildContext context, MindCardStore store, MindCardRecord card) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('마음 카드를 삭제할까요?'),
        content: const Text('삭제한 카드는 이 기기에서 복구할 수 없어요.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('삭제')),
        ],
      ),
    ) ?? false;
    if (confirmed) {
      await store.delete(card.id);
    }
    return confirmed;
  }

  String _agentLabel(String agent) => switch (agent) {
        'bible_ko' => '한국어 성경',
        'bible_en' => '영어 성경',
        'clinical_reflection' => '임상심리 성찰',
        _ => '심리·신앙 통합',
      };

  void _showDetails(BuildContext context, MindCardRecord card) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(card.dateLabel),
        content: SingleChildScrollView(child: Text(card.fullText)),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('확인'))],
      ),
    );
  }
}
