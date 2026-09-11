import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngagementHooks, engagementEventSchema } from '../src/engagement/domain_events.js';

test('cross game analytics names pass the shared contract without personal fields', async () => {
  const received = [];
  const hooks = createEngagementHooks({ onEvent: event => received.push(event) });
  for (const type of ['cross_game_started', 'cross_game_completed', 'cross_game_skipped', 'cross_game_replayed']) {
    const event = { version: 1, type, eventId: `local:${type}`, occurredAt: '2026-09-11T00:00:00.000Z', subjectRef: 'local:device', resourceRef: 'cross_light' };
    assert.equal((await hooks.emit(event)).status, 'delivered');
    assert.equal(engagementEventSchema.safeParse({ ...event, emotion: 'private' }).success, false);
  }
  assert.deepEqual(received.map(event => event.type), ['cross_game_started', 'cross_game_completed', 'cross_game_skipped', 'cross_game_replayed']);
});

test('game metadata allows no user text and rejects invalid scope or duration', () => {
  const event = { version: 1, type: 'cross_game_skipped', eventId: 'local:skip', occurredAt: '2026-09-11T00:00:00.000Z',
    subjectRef: 'local:device', durationMs: 7000, completed: false, entryPoint: 'mind_card' };
  assert.equal(engagementEventSchema.safeParse(event).success, true);
  for (const extra of [{ durationMs: -1 }, { entryPoint: 'private text' }, { type: 'verse_saved' }, { message: 'private' }]) {
    assert.equal(engagementEventSchema.safeParse({ ...event, ...extra }).success, false);
  }
});
