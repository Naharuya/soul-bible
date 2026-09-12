// Lab-only measurement: isolated fixture, no dotenv or production data.
import lighthouse from 'lighthouse';
import { chromium } from '@playwright/test';
import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const directory = new URL('../../build/onaria-lighthouse/', import.meta.url);
const fixture = fork(fileURLToPath(new URL('../e2e/fixture.mjs', import.meta.url)), [], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch('http://127.0.0.1:8799/health')).ok; } catch { /* server starting */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready || fixture.exitCode !== null) throw Error('Isolated fixture unavailable');
  const portFinder = createServer();
  await new Promise(resolve => portFinder.listen(0, '127.0.0.1', resolve));
  const port = portFinder.address().port;
  await new Promise(resolve => portFinder.close(resolve));
  browser = await chromium.launch({ ...(process.env.WEB_BROWSER_CHANNEL ? { channel: process.env.WEB_BROWSER_CHANNEL } : {}), args: [`--remote-debugging-port=${port}`] });
  await mkdir(directory, { recursive: true });
  const summaries = [];
  for (let sample = 1; sample <= 3; sample++) {
    const result = await lighthouse('http://127.0.0.1:8799/', {
      port, output: ['html', 'json'], logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    });
    if (result.lhr.runtimeError) throw Error(result.lhr.runtimeError.code);
    await writeFile(new URL(`mobile-${sample}.html`, directory), result.report[0]);
    await writeFile(new URL(`mobile-${sample}.json`, directory), result.report[1]);
    summaries.push({ sample, scores: Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)])),
      lcpMs: result.lhr.audits['largest-contentful-paint'].numericValue,
      cls: result.lhr.audits['cumulative-layout-shift'].numericValue,
      tbtMs: result.lhr.audits['total-blocking-time'].numericValue });
  }
  const targets = { performance: 90, accessibility: 95, 'best-practices': 95, seo: 95 };
  const passed = summaries.every(s => Object.entries(targets).every(([key, min]) => s.scores[key] >= min));
  await writeFile(new URL('summary.json', directory), JSON.stringify({ profile: 'Lighthouse default mobile simulated throttling; loopback server', fieldCWV: 'Not measured; production field INP requires real traffic', targets, passed, summaries }, null, 2));
  console.log(JSON.stringify({ passed, summaries }));
  if (!passed) process.exitCode = 1;
} finally {
  await browser?.close();
  fixture.kill();
}
