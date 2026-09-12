import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkProviderConfiguration, runRealPreflight, runGuardedStages } from '../scripts/cost_real_preflight.js';

const env = { OPENAI_API_KEY: 'sk-synthetic-preflight-fixture-only', SOUL_AI_MODE: 'openai', SOUL_MULTI_AGENT_ENABLED: 'true' };
for (const failedStage of ['backend_tests', 'flutter_safety_parity']) {
  test(`failed ${failedStage} aborts REAL with zero paid calls`, async () => {
    let paid = 0; const visited = [];
    await assert.rejects(runGuardedStages({ preflight: () => runRealPreflight({ env,
      runner: stage => { visited.push(stage); return stage !== failedStage; } }), stages: [async () => { paid++; }] }));
    assert.equal(paid, 0);
    assert.equal(visited.at(-1), failedStage);
  });
}
test('provider configuration rejects absent/invalid key, disabled provider and unknown prices before tests or payment', async () => {
  for (const override of [{ OPENAI_API_KEY: '' }, { OPENAI_API_KEY: 'invalid' }, { SOUL_AI_MODE: 'local' },
    { SOUL_EXTERNAL_API_DISABLED: 'true' }, { OPENAI_SOL_MODEL: 'unpriced-fixture' }]) {
    let calls = 0;
    await assert.rejects(runGuardedStages({ preflight: () => runRealPreflight({ env: { ...env, ...override }, runner: () => { calls++; return true; } }),
      stages: [async () => { calls++; }] }));
    assert.equal(calls, 0);
  }
  assert.doesNotThrow(() => checkProviderConfiguration(env));
});
test('paid stages follow preflight, minimal/structured, psychology+Sol, session; failed stage stops successors', async () => {
  const visited = [];
  await assert.rejects(runGuardedStages({ preflight: async () => { visited.push('preflight'); }, stages: [
    async () => { visited.push('minimal+structured'); }, async () => { visited.push('psychology+Sol'); throw Error('failure'); },
    async () => { visited.push('session'); },
  ] }));
  assert.deepEqual(visited, ['preflight', 'minimal+structured', 'psychology+Sol']);
});
