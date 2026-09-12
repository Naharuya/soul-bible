import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { safetyPreflight } from './cost_safety_preflight.js';
import { modelForCostTier } from '../src/cost/model_router.js';
import { readPricing, estimateCost } from '../src/cost/model_pricing.js';

const backend = fileURLToPath(new URL('../', import.meta.url));
const root = resolve(backend, '..');
export function checkProviderConfiguration(env) {
  if (env.SOUL_AI_MODE !== 'openai' || env.SOUL_MULTI_AGENT_ENABLED !== 'true'
    || env.SOUL_EXTERNAL_API_DISABLED === 'true' || !/^sk-[A-Za-z0-9_-]{20,}$/.test(env.OPENAI_API_KEY ?? '')) {
    throw Error('PROVIDER_CONFIGURATION_FAILED');
  }
  for (const tier of ['cheap', 'standard', 'premium']) {
    const model = modelForCostTier(tier, env);
    if (!model || /\s/.test(model) || estimateCost({ model, inputTokens: 1, outputTokens: 1 }, readPricing(env)) == null) {
      throw Error('PROVIDER_PRICING_CONFIGURATION_FAILED');
    }
  }
}
function runCommand(stage, env) {
  const testEnv = { ...env, NODE_ENV: 'test' };
  for (const key of Object.keys(testEnv)) if (/^(OPENAI_|SOUL_|ADMIN_|APP_BEARER_TOKEN)/.test(key)) delete testEnv[key];
  let command = process.execPath, args = ['--test'], cwd = backend;
  if (stage === 'flutter_safety_parity') {
    cwd = root;
    if (process.platform === 'win32') {
      testEnv.ONARIA_PREFLIGHT_FLUTTER = env.ONARIA_FLUTTER_BIN
        || (existsSync('C:/src/flutter/bin/flutter.bat') ? 'C:/src/flutter/bin/flutter.bat' : 'flutter.bat');
      command = 'powershell.exe';
      args = ['-NoProfile', '-Command', '& $env:ONARIA_PREFLIGHT_FLUTTER test test/safety_parity_test.dart test/crisis_detector_test.dart; exit $LASTEXITCODE'];
    } else { command = env.ONARIA_FLUTTER_BIN || 'flutter'; args = ['test', 'test/safety_parity_test.dart', 'test/crisis_detector_test.dart']; }
  }
  const result = spawnSync(command, args, { cwd, env: testEnv, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  let output = (result.stdout ?? '') + (result.stderr ?? '');
  for (const [key, value] of Object.entries(env)) if (/KEY|TOKEN|PASSWORD|SECRET/i.test(key) && value?.length > 8) output = output.replaceAll(value, '[REDACTED]');
  mkdirSync(resolve(root, 'build'), { recursive: true });
  writeFileSync(resolve(root, 'build', `cost-v1-preflight-${stage}.log`), output);
  return result.status === 0 && !result.error;
}

// Every public paid CLI calls this before constructing any real OpenAI client.
export async function runRealPreflight({ env = process.env, runner = runCommand } = {}) {
  checkProviderConfiguration(env);
  const safety = await safetyPreflight();
  for (const stage of ['backend_tests', 'flutter_safety_parity']) {
    console.log(JSON.stringify({ preflight: stage, status: 'RUNNING', paidCalls: 0 }));
    if (!await runner(stage, env)) throw Error(`PREFLIGHT_FAILED_${stage}`);
    console.log(JSON.stringify({ preflight: stage, status: 'PASS', paidCalls: 0 }));
  }
  return { providerConfiguration: 'PASS', safety, backendTests: 'PASS', flutterSafetyParity: 'PASS' };
}

export async function runGuardedStages({ preflight = runRealPreflight, stages }) {
  await preflight();
  for (const stage of stages) await stage();
}
