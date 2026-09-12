import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('admin usage UI renders measured costs and does not present missing pricing as free', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, { textContent: '', addEventListener() {} }]));
  const context = vm.createContext({ document: { getElementById: id => { assert.ok(elements.has(id), id); return elements.get(id); } }, sessionStorage: { getItem: () => '' }, Intl });
  vm.runInContext(await readFile(new URL('../public/admin.js', import.meta.url), 'utf8'), context);
  context.renderAiUsage({ available: true, today: { modelCalls: 2, inputTokens: 100, estimatedCostUsd: 0.01 },
    routing: { local: 1, rag: 0, cheap: 0, standard: 1, premium: 0 }, cacheHitRate: 0.4, estimatedCacheSavings: 0.001 });
  assert.equal(elements.get('aiCost').textContent, '$0.010000');
  assert.equal(elements.get('aiCacheRate').textContent, '40.0%');
  assert.match(elements.get('aiRouting').textContent, /LOCAL 50.0%/);
  context.renderAiUsage({ available: true, today: { estimatedCostUsd: null }, routing: {}, cacheHitRate: 0 });
  assert.equal(elements.get('aiCost').textContent, '데이터 없음');
  assert.equal(elements.get('aiCacheRate').textContent, '데이터 없음');
  context.renderAiUsage(undefined);
  assert.equal(elements.get('aiCalls').textContent, '데이터 없음');
  assert.equal(elements.get('aiUsageStatus').textContent, '집계 사용 불가');
  context.renderAiUsage({ available: true, scope: 'sqlite', today: {}, routing: {}, cacheHitRate: 0 });
  assert.equal(elements.get('aiUsageStatus').textContent, '저장된 사용량 · UTC 날짜 기준');
});
