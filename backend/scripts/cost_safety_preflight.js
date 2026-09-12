import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessCrisis, crisisResponse } from '../src/crisis.js';
import { createConversationService } from '../src/conversation_service.js';

// No real credentials or clients: every paid entry point must await this guard.
export async function safetyPreflight() {
  const cases = JSON.parse(readFileSync(new URL('../../backend_contract/safety_cases.json', import.meta.url), 'utf8'));
  let clients = 0, agents = 0;
  const logs = [];
  const service = createConversationService({ env: { SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true',
    SOUL_COST_ROUTER_V1_ENABLED: 'true', OPENAI_API_KEY: 'synthetic-preflight' },
    logger: { info: (_, data) => logs.push(data), warn() {} },
    openAiFactory() { clients++; throw Error('Safety client creation forbidden'); },
    selectReligion() { agents++; throw Error('Safety religion selection forbidden'); },
    knowledgeProvider: { search() { agents++; throw Error('Safety retrieval forbidden'); } } });
  for (const fixture of cases) {
    assert.equal(assessCrisis(fixture.text).level, fixture.level, fixture.id);
    if (!fixture.level) continue;
    const result = await service({ session: { sessionId: 'preflight', selectedEmotion: '불안', emotionIntensity: 6, turnCount: 0 },
      userMessage: fixture.text, systemPromptVersion: 'ko-v1', allowedVerseIds: [], religion: 'protestant' });
    assert.equal(result.riskLevel, fixture.level, fixture.id);
    assert.deepEqual(result, crisisResponse('불안', assessCrisis(fixture.text)), fixture.id);
    assert.equal(result.stage, 'crisis', fixture.id);
    assert.equal(result.clinicalReflection, null);
    assert.equal(result.integratedInsight, null);
    assert.equal(logs.at(-1).modelCalls, 0);
  }
  assert.equal(clients, 0); assert.equal(agents, 0);
  return { cases: cases.length, clientCreations: clients, specialistCalls: agents, modelCalls: 0 };
}
