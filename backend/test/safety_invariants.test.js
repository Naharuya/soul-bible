import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assessCrisis, assessRequestCrisis, crisisResponse } from '../src/crisis.js';
import { createConversationService } from '../src/conversation_service.js';
import { createConversationOrchestrator } from '../src/agents/conversation_orchestrator.js';
import { createLocalConversationService } from '../src/local_conversation_service.js';
import { createOpenAiService } from '../src/openai_service.js';
import { createApp } from '../src/app.js';
import { costBody, costEnv, costFactory } from './fixtures/cost_fixtures.js';

const cases = JSON.parse(await readFile(new URL('../../backend_contract/safety_cases.json', import.meta.url), 'utf8'));
test('shared corpus covers every requested safety category with unique case IDs', () => {
  const categories = ['직접적 자살 의도', '간접적 자살 암시', '자해 의도', '극심한 절망', '죽고 싶다는 표현',
    '구체적 계획 암시', '타인에게 해를 끼치려는 표현', '단순 슬픔', '일반 불안', '종교적 죄책감', '비유적 표현', '농담/인용/가사 형태의 위험 단어'];
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  for (const category of categories) assert.ok(cases.filter((item) => item.category === category).length >= 2, category);
});
test('shared Flutter/backend risk corpus has identical expected levels', () => {
  for (const fixture of cases) {
    const risk = assessCrisis(fixture.text);
    assert.equal(risk.level, fixture.level, fixture.id);
    assert.equal(risk.immediate, fixture.level >= 3, fixture.id);
  }
});

test('all religions and every fallback entry preserve crisis with zero downstream calls', async () => {
  let downstream = 0; let logs = 0;
  const forbidden = () => { downstream++; throw Error('provider-secret-must-not-escape'); };
  const service = createConversationService({ env: { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true', OPENAI_API_KEY: 'test-only' },
    logger: { info() { logs++; throw Error('logger failure'); }, warn() { throw Error('logger failure'); } }, openAiFactory: forbidden, selectReligion: forbidden,
    knowledgeProvider: { search: forbidden }, usageLedger: { reserve() { throw Error('ledger failure'); } } });
  // Accounting/logging are allowed to fail without invoking provider or routing.
  const local = createLocalConversationService();
  const orchestrator = createConversationOrchestrator({ runStructured: forbidden, selectReligion: forbidden, knowledgeProvider: { search: forbidden } });
  const direct = createOpenAiService({ apiKey: 'test-only', model: 'fixture', client: { responses: { create: forbidden } } });
  for (const religion of ['protestant', 'catholic', 'buddhist', 'jewish', 'islamic', 'hindu', 'confucian']) {
    for (const fixture of cases.filter((item) => item.level > 0)) {
      const body = { ...costBody(fixture.text), religion };
      const expected = crisisResponse(body.session.selectedEmotion, assessRequestCrisis(body));
      assert.match(expected.question, /지금 안전한 곳/);
      assert.match(expected.message, /믿을 수 있는/);
      assert.match(expected.message, /현지 응급 서비스/);
      assert.match(expected.message, /한국/);
      assert.doesNotMatch(expected.message + expected.question, /회개|벌을|믿음이 부족|기도하면|설교/);
      assert.equal(expected.shouldOfferVerse, false);
      assert.equal(expected.suggestedVerseId, null);
      assert.deepEqual(await service(body), expected);
      assert.deepEqual(await orchestrator(body), expected);
      assert.deepEqual(await local(body, { id: 'integrated' }), expected);
      assert.deepEqual(await direct(body, { id: 'integrated' }), expected);
      assert.equal(downstream, 0);
    }
  }
  assert.ok(logs > 0);
});

test('session crisis and custom emotion cannot be downgraded by a neutral follow-up', async () => {
  for (const session of [{ riskLevel: 3 }, { currentStage: 'crisis' }, { customEmotion: '자해하고 싶어요' }]) {
    const body = costBody('네 알겠어요'); Object.assign(body.session, session);
    const result = await createConversationService({ env: {}, logger: {} })(body);
    assert.equal(result.stage, 'crisis'); assert.ok(result.riskLevel > 0);
    assert.equal(result.shouldOfferVerse, false);
  }
});

test('risk input independently has zero psychology calls, religion calls and client creations (cold and warm)', async () => {
  const counts = { psychologyModelCalls: 0, religionModelCalls: 0, openAiClientCreations: 0 };
  const factory = costFactory();
  const service = createConversationService({ env: costEnv, logger: {},
    openAiFactory(options) {
      counts.openAiClientCreations++;
      const provider = factory(options);
      return { async runStructured(task, context) {
        if (task.name === 'psychology_reflection') counts.psychologyModelCalls++;
        else counts.religionModelCalls++;
        return provider.runStructured(task, context);
      } };
    },
  });
  async function verifyRiskBatch() {
    const before = { ...counts };
    for (const fixture of cases.filter((item) => item.level > 0)) {
      const result = await service(costBody(fixture.text));
      assert.equal(result.stage, 'crisis', fixture.id);
      assert.deepEqual(counts, before, fixture.id);
    }
  }
  await verifyRiskBatch();
  assert.deepEqual(counts, { psychologyModelCalls: 0, religionModelCalls: 0, openAiClientCreations: 0 });
  // Positive control: ordinary input really reaches these spies. Zero is not
  // an artifact of disabled AI, a failing ledger or disconnected instrumentation.
  await service(costBody());
  assert.ok(counts.openAiClientCreations > 0);
  assert.ok(counts.psychologyModelCalls > 0);
  assert.ok(counts.religionModelCalls > 0);
  await verifyRiskBatch(); // risk makes zero additional calls on a warm service
});

async function serverFor(t, options) {
  const server = createApp({ memberStore: {}, ...options }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return (body) => fetch(`http://127.0.0.1:${server.address().port}/v1/mind/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
test('real HTTP boundary validates then intercepts risk before member identity and generation', async (t) => {
  let calls = 0; const fail = () => { calls++; throw Error('must not run'); };
  const post = await serverFor(t, { generate: fail, identity: { required: true, verify: fail } });
  assert.equal((await post({})).status, 400);
  for (const fixture of cases.filter((item) => item.level > 0)) {
    const body = costBody(fixture.text);
    // Fresh HTTP app per case avoids confusing the production 20/minute rate
    // limit with a Safety regression as the shared corpus expands.
    const send = await serverFor(t, { generate: fail, identity: { required: true, verify: fail } });
    const response = await send(body); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), crisisResponse(body.session.selectedEmotion, assessCrisis(fixture.text)));
  }
  assert.equal(calls, 0);
});
test('model-indicated risk returns fixed crisis response, never model raw text', async (t) => {
  const post = await serverFor(t, { generate: async () => ({ ...crisisResponse('불안', { level: 2 }), message: 'raw-private-model-output', shouldOfferVerse: true }) });
  const response = await post(costBody()); const json = await response.json();
  assert.deepEqual(json, crisisResponse('불안', { level: 2 }));
});
test('throwing error logger cannot expose provider errors or stacks', async (t) => {
  const fail = () => { throw Error('sk-private-key model raw text stack'); };
  const post = await serverFor(t, { generate: fail, logger: { error: fail } });
  const response = await post(costBody()); assert.equal(response.status, 502);
  assert.equal(response.headers.get('content-type').includes('application/json'), true);
  assert.doesNotMatch(await response.text(), /sk-private|model raw|stack/);
});

test('safety events contain only derived fields and preserve custom/session categories', async (t) => {
  const events = [];
  let calls = 0;
  const post = await serverFor(t, {
    logger: { info: (name, event) => events.push({ name, event }) },
    generate: async () => { calls++; return crisisResponse('불안', { level: 2 }); },
  });
  assert.equal((await post({})).status, 400);
  assert.equal(events.length, 0);
  const body = costBody('private-input-marker');
  body.session.customEmotion = '자해하고 싶어요';
  assert.equal((await post(body)).status, 200);
  body.session.customEmotion = '';
  body.session.riskLevel = 3;
  assert.equal((await post(body)).status, 200);
  assert.equal(calls, 0);
  assert.equal((await post(costBody())).status, 200);
  assert.deepEqual(events.map(({ event }) => [event.riskLevel, event.crisisTriggered, event.category]), [
    [2, true, 'self_harm'], [3, true, 'session_crisis'],
    [0, false, 'safe'], [2, true, 'response_crisis'],
  ]);
  for (const { name, event } of events) {
    assert.equal(name, 'safety_assessment');
    assert.deepEqual(Object.keys(event).sort(), ['category', 'crisisTriggered', 'riskLevel', 'timestamp']);
    assert.equal(new Date(event.timestamp).toISOString(), event.timestamp);
  }
  assert.doesNotMatch(JSON.stringify(events), /private-input-marker|자해하고|sessionId/);
});

test('sync and async safety logger failures never block crisis support', async (t) => {
  for (const info of [() => { throw Error('private'); }, async () => { throw Error('private'); }]) {
    const post = await serverFor(t, {
      logger: { info }, generate: () => assert.fail('must not call model'),
    });
    const body = costBody('자해하고 싶어요');
    const response = await post(body);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), crisisResponse(body.session.selectedEmotion, { level: 2 }));
  }
});

test('deployment smoke runs against the real HTTP app with production mode and no model calls', async (t) => {
  let calls = 0;
  const server = createApp({ memberStore: {}, generate: () => { calls++; throw Error('must not call'); } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/safety_smoke.js', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'production', APP_BEARER_TOKEN: '', SAFETY_SMOKE_BASE_URL: `http://127.0.0.1:${server.address().port}` },
    timeout: 30_000,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true); assert.equal(result.results.length, 13);
  assert.equal(calls, 0);
});
