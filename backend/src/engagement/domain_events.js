import { z } from 'zod';

export const engagementEventTypes = Object.freeze(['daily_checkin_completed', 'verse_saved', 'mind_card_created',
  'seven_day_journey_progress', 'share_card_requested', 'easter_egg_unlocked', 'mini_game_completed',
  'cross_game_started', 'cross_game_completed', 'cross_game_skipped', 'cross_game_replayed']);
// A preparation hook only: no UI, transport, persistence, timers or member/conversation payloads.
export const engagementEventSchema = z.object({
  version: z.literal(1), type: z.enum(engagementEventTypes),
  eventId: z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/), occurredAt: z.string().datetime(),
  subjectRef: z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/),
  resourceRef: z.string().regex(/^[a-zA-Z0-9:._-]{1,128}$/).optional(),
  journeyDay: z.number().int().min(1).max(7).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  completed: z.boolean().optional(),
  entryPoint: z.enum(['mind_card', 'engagement_menu']).optional(),
}).strict().refine(event => event.type === 'seven_day_journey_progress' ? event.journeyDay !== undefined : event.journeyDay === undefined,
  'journeyDay belongs only to journey progress').refine(event => event.type.startsWith('cross_game_') ||
    (event.durationMs === undefined && event.completed === undefined && event.entryPoint === undefined),
  'game metadata belongs only to cross game events');

export function createEngagementHooks({ onEvent } = {}) {
  if (onEvent !== undefined && typeof onEvent !== 'function') throw new Error('Invalid engagement handler.');
  return Object.freeze({
    async emit(input) {
      const event = engagementEventSchema.parse(input);
      if (!onEvent) return { status: 'disabled' };
      // Consumer errors cannot fail or mutate the producing domain operation.
      try { await onEvent(Object.freeze(structuredClone(event))); return { status: 'delivered' }; }
      catch { return { status: 'handler_failed' }; }
    },
  });
}
