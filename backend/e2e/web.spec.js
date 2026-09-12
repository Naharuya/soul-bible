import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [360, 390, 430, 768, 1280, 1440]) {
  test(`public navigation, layout and accessibility at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const path of ['/', '/about', '/services', '/traditions', '/privacy', '/terms']) {
      await page.goto(path); await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(results.violations).toEqual([]);
    }
    await page.goto('/');
    if (width < 768) { await page.getByRole('button', { name: '메뉴' }).click(); await expect(page.locator('#site-nav')).toBeVisible(); }
    await page.locator('#site-nav').getByRole('link', { name: '서비스', exact: true }).click();
    await expect(page).toHaveURL(/\/services$/);
    expect(errors).toEqual([]);
    await page.goto('/'); await page.screenshot({ path: testInfo.outputPath(`homepage-${width}.png`), fullPage: true });
  });
}

test('admin cookie authentication, desktop/mobile routes, empty/error states and logout', async ({ page, context }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin/dashboard');
  await expect(page.locator('#loginPanel')).toBeVisible(); await expect(page.locator('#dashboard')).toBeHidden();
  await page.locator('#tokenInput').fill('onaria-browser-test-only'); await page.getByRole('button', { name: '대시보드 열기' }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
  const cookies = await context.cookies(); expect(cookies.find(c => c.name === 'onaria_admin_dev').httpOnly).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('soulBibleAdminToken'))).toBeNull();
  expect(await page.evaluate(() => document.cookie)).not.toContain('onaria_admin');
  // Subsequent page loads restore the server session without a stored credential.
  for (const width of [360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['dashboard', 'users', 'ai-usage', 'safety', 'content', 'analytics', 'system']) {
      await page.goto('/admin/' + path); await expect(page.locator('#dashboard')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(result.violations).toEqual([]);
    }
    await page.goto('/admin/dashboard'); await expect(page.locator('#dashboard')).toBeVisible();
    await expect(page.locator('#sessionCount')).toHaveText('측정 준비 중');
    await page.screenshot({ path: testInfo.outputPath(`admin-${width}.png`), fullPage: true });
    if (width < 768) { await page.locator('#adminMenu').click(); await expect(page.locator('#adminNav')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#adminNav')).toBeHidden(); }
  }
  await page.route('**/v1/admin/overview', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Unavailable"}' }));
  await page.getByRole('button', { name: '새로고침', exact: true }).click(); await expect(page.locator('#dashboardError')).toContainText('불러오지 못했습니다');
  await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#loginPanel')).toBeHidden();
  await page.unroute('**/v1/admin/overview');
  await page.getByRole('button', { name: '새로고침', exact: true }).click(); await expect(page.locator('#dashboard')).toBeVisible();
  await expect(page.locator('#dashboardError')).toBeEmpty();
  await page.locator('#logoutButton').click(); await expect(page.locator('#loginPanel')).toBeVisible();
  await expect.poll(async () => (await context.cookies()).some(c => c.name === 'onaria_admin_dev')).toBe(false);
  await page.reload(); await expect(page.locator('#dashboard')).toBeHidden();
  expect(errors).toEqual([]);
});

test('PWA shell works offline without caching API responses', async ({ page, context }) => {
  await page.goto('/admin/'); await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator('#tokenInput').fill('onaria-browser-test-only'); await page.getByRole('button', { name: '대시보드 열기' }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat());
  expect(cached.some(url => url.includes('/v1/'))).toBe(false);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('#loginPanel')).toBeVisible(); await expect(page.locator('#dashboard')).toBeHidden();
  await expect(page.locator('#connectionStatus')).toContainText('오프라인');
});

test('populated admin metrics stay readable, escaped and accurate at every target width', async ({ page }, testInfo) => {
  // Synthetic API fixture only; these values are never served by production.
  await page.route('**/v1/admin/overview', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.aiUsage = { available: true, scope: 'sqlite', today: { aiRequests: 3, modelCalls: 4, inputTokens: 1000, cachedInputTokens: 400, outputTokens: 500, estimatedCostUsd: 0.006 },
      averageCostPerAiSession: 0.003, cacheHitRate: 0.4, routing: { cheap: 2, standard: 1 } };
    data.modelUsage = { available: true, entryCount: 4, sessionCosts: { sessionCount: 2, unknownSessions: 0, p50CostUsd: 0.002, p90CostUsd: 0.004 },
      rows: [{ tier: 'Luna', model: 'synthetic-model-with-long-name-for-layout', modelCalls: 3, inputTokens: 700, cachedInputTokens: 400, outputTokens: 300, estimatedCostUsd: 0.002, fallback: 0 },
        { tier: 'Sol', model: '<img src=x onerror=alert(1)>', modelCalls: 1, inputTokens: 300, cachedInputTokens: 0, outputTokens: 200, estimatedCostUsd: 0.004, fallback: 0 }] };
    data.operations = { ...data.operations, completed: 3, fallbackRate: 0, safety: [{ category: 'self_harm', riskLevel: 2, crisisTriggered: true, count: 1, timestamp: data.generatedAt }] };
    await route.fulfill({ response, json: data });
  });
  await page.goto('/admin/dashboard');
  await page.locator('#tokenInput').fill('onaria-browser-test-only');
  await page.getByRole('button', { name: '대시보드 열기' }).click();
  await expect(page.locator('#aiRequests')).toHaveText('3');
  await expect(page.locator('#sessionP90')).toHaveText('$0.004000');
  await expect(page.locator('#tierShares')).toContainText('Luna 75.0%');
  await expect(page.locator('#modelRows img')).toHaveCount(0);
  for (const width of [360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['dashboard', 'ai-usage', 'safety', 'users', 'system']) {
      await page.goto('/admin/' + path);
      await expect(page.locator('#dashboard')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto('/admin/ai-usage');
    await expect(page.locator('#sessionP50')).toHaveText('$0.002000');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`admin-populated-${width}.png`), fullPage: true });
  }
});

test('public homepage performance lab sample', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 200000, uploadThroughput: 100000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    window.lab = { lcpMs: null, cls: 0, interactionSamplesMs: [] };
    new PerformanceObserver(list => { window.lab.lcpMs = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.lab.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.interactionId) window.lab.interactionSamplesMs.push(entry.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  });
  await page.goto('/'); await page.locator('.hero-art img').evaluate(img => img.decode());
  await page.getByRole('button', { name: '메뉴' }).click();
  await expect(page.locator('#site-nav')).toBeVisible();
  await page.keyboard.press('Escape');
  const sample = await page.evaluate(() => ({ ...window.lab,
    resourceBytes: performance.getEntriesByType('resource').reduce((total, entry) => total + entry.encodedBodySize, 0),
    externalResources: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin !== location.origin).map(entry => entry.name),
  }));
  expect(sample.externalResources).toEqual([]);
  expect(sample.resourceBytes).toBeLessThan(100000);
  expect(sample.cls).toBeLessThan(0.1);
  await testInfo.attach('performance-lab.json', { body: JSON.stringify({ ...sample, profile: '390px / 100ms RTT / 1.6Mbps / CPU 4x', fieldINP: 'Not measured; interaction samples are not field INP' }, null, 2), contentType: 'application/json' });
  console.log('ONARIA_LAB', JSON.stringify(sample));
});
