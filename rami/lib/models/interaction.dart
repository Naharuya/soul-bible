class Interaction {
  Interaction({
    required this.cardId,
    required this.action,
    required this.createdAt,
  });

  final String cardId;
  final String action;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
        'cardId': cardId,
        'action': action,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Interaction.fromJson(Map<String, dynamic> json) {
    return Interaction(
      cardId: json['cardId'] as String? ?? '',
      action: json['action'] as String? ?? '',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    );
  }
}
