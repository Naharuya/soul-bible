import 'mind_card_store.dart';

class MindHistoryDay {
  const MindHistoryDay(this.date, this.cards);
  final DateTime date;
  final List<MindCardRecord> cards;
}

MindCardRecord? actionToRevisit(
    Iterable<MindCardRecord> records, DateTime now) {
  final local = now.toLocal();
  final today = DateTime(local.year, local.month, local.day);
  final oldest = DateTime(local.year, local.month, local.day - 7);
  final candidates = records
      .where((card) =>
          card.createdAt.toLocal().isBefore(today) &&
          !card.createdAt.toLocal().isBefore(oldest) &&
          card.actionReview != 'done')
      .toList()
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return candidates.firstOrNull;
}

/// Local calendar days, including today. Existing records are never rewritten.
List<MindHistoryDay> sevenDayHistory(
    Iterable<MindCardRecord> records, DateTime now) {
  final local = now.toLocal();
  final start = DateTime(local.year, local.month, local.day - 6);
  final eligible = records
      .where((card) => !card.createdAt.isAfter(now))
      .toList()
    ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  return List.generate(7, (index) {
    final date = DateTime(start.year, start.month, start.day + index);
    final next = DateTime(date.year, date.month, date.day + 1);
    return MindHistoryDay(date, List.unmodifiable(eligible.where((card) {
      final at = card.createdAt.toLocal();
      return !at.isBefore(date) && at.isBefore(next);
    })));
  });
}
