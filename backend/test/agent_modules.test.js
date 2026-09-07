import assert from 'node:assert/strict';
import { test } from 'node:test';

test('stage 2: all conversation modules expose callable entry points', async () => {
  for (const [file, entry] of Object.entries({
    conversation_orchestrator: 'createConversationOrchestrator',
    safety_agent: 'assessSafety', psychology_agent: 'createPsychologyAgent',
    religion_router: 'routeReligion', religious_integrity_agent: 'reviewReligiousIntegrity',
    response_integrator: 'integrateResponse',
  })) {
    const module = await import(`../src/agents/${file}.js`);
    assert.equal(typeof module[entry], 'function', file);
  }
  for (const religion of ['protestant', 'catholic', 'buddhist', 'jewish', 'islamic', 'hindu', 'confucian']) {
    const module = await import(`../src/agents/religions/${religion}_agent.js`);
    assert.equal(module.religionAgent.id, religion);
    assert.equal(typeof module.religionAgent.generate, 'function');
  }
});
