import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createConversationOrchestrator, normalizeContext } from '../src/agents/conversation_orchestrator.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { agents } from '../src/ai_router.js';
import { emotions, responseSchema } from '../src/schema.js';
import { religionIds } from '../src/agents/religion_router.js';
import { assessCrisis, crisisResponse } from '../src/crisis.js';
import { createApp } from '../src/app.js';

const request = (session = {}, extra = {}) => ({
  session: { sessionId: 'local-orchestrator', selectedEmotion: '불안', emotionIntensity: 7, turnCount: 1, ...session },
  userMessage: '내일 발표가 걱정돼요', systemPromptVersion: 'ko-v1', allowedVerseIds: ['PHP_4_6_7'], ...extra,
});

test('phase 1: default orchestrator exactly preserves local responses across emotions, roles and stages', async () => {
  const generate = createConversationOrchestrator();
  const local = createLocalConversationService();
  const states = [0, 1, 2, 5, 6].map((turnCount) => ({ turnCount }));
  states.push({ turnCount: 3, verseAccepted: true }, { turnCount: 3, verseAccepted: false }, { turnCount: 3, selectedVerse: 'PHP_4_6_7' });
  for (const selectedEmotion of emotions) for (const agent of Object.values(agents)) {
    for (const state of states) for (const allowedVerseIds of [[], ['PHP_4_6_7']]) {
      const body = request({ selectedEmotion, ...state }, { allowedVerseIds });
      const snapshot = structuredClone(body);
      for (const memory of ['', 'earlier summary']) {
        assert.deepEqual(await generate(body, agent, memory), await local(body, agent, memory));
      }
      assert.deepEqual(body, snapshot);
    }
  }
  assert.equal(generate.mode, 'local conversation');
});

test('phase 1: religion defaults internally and routes without generating religious content', async () => {
  const visited = [];
  const generate = createConversationOrchestrator({ selectReligion: (id) => {
    visited.push(id);
    return { id, generate: () => assert.fail('phase 1 must not generate religious content') };
  } });
  assert.equal(normalizeContext(request()).religion, 'protestant');
  for (const religion of [undefined, ...religionIds]) {
    const body = request({}, religion ? { religion } : {});
    assert.deepEqual(await generate(body, agents.integrated), await createLocalConversationService()(body, agents.integrated));
  }
  assert.deepEqual(visited, ['protestant', ...religionIds]);
});

test('phase 1: safety intercepts every existing risk level before religion routing', async () => {
  const generate = createConversationOrchestrator({ selectReligion: () => assert.fail('religion ran before safety') });
  for (const userMessage of ['사라지고 싶어요', '죽고 싶어요', '지금 당장 죽고 싶고 계획을 세웠어요', '숨을 못 쉬어요', '환청이 들려요', '지금 당장 해치고 싶어요']) {
    assert.deepEqual(await generate(request({}, { userMessage }), agents.bible_ko), crisisResponse('불안', assessCrisis(userMessage)));
  }
});

test('phase 1: a routing failure falls back to the unchanged local service with a redacted log', async () => {
  const logs = [];
  const generate = createConversationOrchestrator({ selectReligion: () => { throw Error('private user text'); },
    logger: { warn: (...args) => logs.push(args) },
  });
  const body = request();
  assert.deepEqual(await generate(body, agents.integrated), await createLocalConversationService()(body, agents.integrated));
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /private user text/);
});

test('phase 1: invalid requests fail before routing, rather than triggering fallback', async () => {
  const generate = createConversationOrchestrator({ selectReligion: () => assert.fail('must not route') });
  await assert.rejects(generate({}));
});

test('phase 1: default orchestrator import graph cannot reach the OpenAI provider or feature-flag factory', async () => {
  const visited = new Set();
  async function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = await readFile(url, 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*['"]openai(?:\/|['"])/);
    for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+\.js)['"]/g)) {
      const dependency = new URL(match[1], url);
      assert.doesNotMatch(dependency.pathname, /\/(?:openai_service|conversation_service)\.js$/);
      await visit(dependency);
    }
  }
  // Phase 2 connects server.js to the gated factory; the original local skeleton stays independent.
  await visit(new URL('../src/agents/conversation_orchestrator.js', import.meta.url));
  assert.ok([...visited].some((url) => url.endsWith('/agents/conversation_orchestrator.js')));
});

test('phase 1: HTTP orchestrator responses equal the previous local HTTP path including memory and crisis', async () => {
  async function start(generate) {
    const app = createApp({ generate, memberStore: {}, logger: { error() {} } });
    return new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  }
  const local = await start(createLocalConversationService());
  let orchestrated;
  try {
    orchestrated = await start(createConversationOrchestrator());
    for (const body of [request({ turnCount: 0 }), request({ turnCount: 1 }), request({ turnCount: 2 }),
      request({ turnCount: 3, verseAccepted: true }), request({}, { userMessage: '지금 당장 죽고 싶고 계획을 세웠어요' }), {}]) {
      const results = [];
      for (const server of [local, orchestrated]) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        });
        const json = await response.json();
        if (response.ok) responseSchema.parse(json);
        results.push({ status: response.status, json });
      }
      assert.deepEqual(results[0], results[1]);
    }
  } finally {
    await new Promise((resolve) => local.close(resolve));
    if (orchestrated) await new Promise((resolve) => orchestrated.close(resolve));
  }
});
