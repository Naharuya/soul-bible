import 'dart:async';

// Same v1 wire contract as backend/src/engagement/domain_events.js.
// No network transport or free-form analytics properties are attached.
enum EngagementEventType {
  dailyCheckinCompleted('daily_checkin_completed'), verseSaved('verse_saved'),
  mindCardCreated('mind_card_created'), sevenDayJourneyProgress('seven_day_journey_progress'),
  shareCardRequested('share_card_requested'), easterEggUnlocked('easter_egg_unlocked'),
  miniGameCompleted('mini_game_completed');
  const EngagementEventType(this.wire);
  final String wire;
}

class EngagementEvent {
  EngagementEvent(this.type, {required this.occurredAt, this.resourceRef, this.journeyDay}) {
    if (resourceRef != null && !RegExp(r'^[a-zA-Z0-9:._-]{1,128}$').hasMatch(resourceRef!)) {
      throw ArgumentError('Only opaque resource identifiers are allowed');
    }
    if (type == EngagementEventType.sevenDayJourneyProgress
        ? journeyDay == null || journeyDay! < 1 || journeyDay! > 7
        : journeyDay != null) {
      throw ArgumentError('Invalid journey event');
    }
  }
  final EngagementEventType type;
  final DateTime occurredAt;
  final String? resourceRef;
  final int? journeyDay;
  static int _sequence = 0;
  late final String eventId = 'local:${occurredAt.microsecondsSinceEpoch}:${_sequence++}';
  Map<String, Object> toJson() => {
    'version': 1, 'type': type.wire, 'eventId': eventId,
    'occurredAt': occurredAt.toUtc().toIso8601String(), 'subjectRef': 'local:device',
    if (resourceRef != null) 'resourceRef': resourceRef!,
    if (journeyDay != null) 'journeyDay': journeyDay!,
  };
}

enum EngagementMetric {
  notificationOptIn, returnAfterNotification, shareRequested, shareCompleted,
  journeyStarted, journeyCompleted, easterEggUnlocked, miniGameStarted, miniGameCompleted,
}

class EngagementEventBus {
  EngagementEventBus({this.sink});
  final Future<void> Function(EngagementEvent event)? sink;
  Future<void> emit(EngagementEvent event) async {
    try {
      await Future<void>.sync(() => sink?.call(event)).timeout(const Duration(milliseconds: 300));
    } catch (_) {
      // A failed or stalled future transport must not affect app operations.
    }
  }
}
