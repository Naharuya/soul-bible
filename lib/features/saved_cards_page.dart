import 'package:flutter/material.dart';
import '../app/mind_card_store.dart';
import '../app/app_theme.dart';

class SavedCardsPage extends StatelessWidget {
  const SavedCardsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final store = MindCardStore();

    return Scaffold(
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
            return const Center(
              child: Text('아직 저장된 카드가 없어요.', style: TextStyle(color: Colors.grey)),
            );
          }

          final cards = snapshot.data!;
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: cards.length,
            itemBuilder: (context, index) {
              final card = cards[index];
              return Card(
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
                            Text(card.dateLabel, style: const TextStyle(fontSize: 13, color: AppTheme.green, fontWeight: FontWeight.w700)),
                            const Icon(Icons.chevron_right, size: 20, color: Colors.grey),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text('${card.emotion} · ${card.intensity}/10', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text(card.verseReference, style: const TextStyle(color: Color(0xFF65726B))),
                      ],
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
