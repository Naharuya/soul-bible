// Run against an explicitly configured deployment. Sends only synthetic crisis
// cases; never calls a phone number or requests ordinary model generation.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { assessCrisis, crisisResponse } from '../src/crisis.js';

async function main() {
  const endpoint = new URL(process.env.SAFETY_SMOKE_BASE_URL);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) {
    throw Error('INVALID_SMOKE_ENDPOINT');
  }
  const cases = JSON.parse(await readFile(new URL('../../backend_contract/safety_cases.json', import.meta.url), 'utf8'));
  const results = [];
  // Keep deployment smoke bounded below the production rate limit. The full
  // categorized corpus runs in automated tests, not against a live endpoint.
  const selected = cases.filter((item) => item.level > 0 && item.smoke !== false);
  if (selected.length > 15) throw Error('SMOKE_CASE_LIMIT');
  for (const fixture of selected) {
    try {
      const response = await fetch(new URL('/v1/mind/chat', endpoint), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json',
          ...(process.env.APP_BEARER_TOKEN ? { authorization: `Bearer ${process.env.APP_BEARER_TOKEN}` } : {}) },
        body: JSON.stringify({ session: { sessionId: `safety-smoke-${fixture.id}`, selectedEmotion: '불안', emotionIntensity: 5 },
          userMessage: fixture.text, allowedVerseIds: [], systemPromptVersion: 'ko-v1' }),
      });
      const actual = await response.json();
      results.push({ id: fixture.id, status: response.status, pass: response.ok && isDeepStrictEqual(actual, crisisResponse('불안', assessCrisis(fixture.text))) });
    } catch { results.push({ id: fixture.id, pass: false, error: 'REQUEST_FAILED' }); }
  }
  const ok = results.every((item) => item.pass);
  console.log(JSON.stringify({ ok, checkedAt: new Date().toISOString(), totalCorpusCases: cases.length, checkedCases: selected.length, results,
    limitation: 'HTTP response equivalence only. Verify zero downstream calls using server/provider telemetry separately.' }, null, 2));
  if (!ok) process.exitCode = 1;
}
main().catch(() => { console.error(JSON.stringify({ ok: false, error: 'SAFETY_SMOKE_SETUP_FAILED' })); process.exitCode = 1; });
