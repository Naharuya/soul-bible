import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalConversationService } from '../src/local_conversation_service.js';

const generate = createLocalConversationService();
const agent = { id: 'integrated' };

function body(turnCount, overrides = {}) {
  return {
    session: {
      sessionId: 'local-test',
      selectedEmotion: '불안',
      emotionIntensity: 7,
      turnCount,
      ...overrides,
    },
    userMessage: '마음을 이야기하고 싶어요.',
    allowedVerseIds: ['verse-1'],
  };
}

test('progresses through reflection stages without an external API', async () => {
  assert.equal((await generate(body(0), agent)).stage, 'thought');
  assert.equal((await generate(body(1), agent)).stage, 'need');
  const verse = await generate(body(2), agent);
  assert.equal(verse.stage, 'verse_offer');
  assert.equal(verse.suggestedVerseId, 'verse-1');
  assert.equal(verse.question, null);
});

test('moves to a small action after accepting a verse', async () => {
  const result = await generate(body(5, { verseAccepted: true }), agent);
  assert.equal(result.stage, 'action');
  assert.deepEqual(result.actionTags, ['작은 행동']);
});
