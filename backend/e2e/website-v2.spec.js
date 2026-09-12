import { test, expect } from '@playwright/test';

test('brand structure, honest availability, SEO, links and 404', async ({ page, request }) => {
  for (const path of ['/', '/about', '/services', '/traditions', '/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveCount(1);
    const canonical = await page.locator('link[rel=canonical]').getAttribute('href');
    expect(new URL(canonical).pathname).toBe(path);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
    const organization = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(organization['@type']).toBe('Organization');
    expect(organization.name).toBe('ONARIA');
    const hrefs = await page.locator('a').evaluateAll(links => [...new Set(links.map(a => a.getAttribute('href')))]);
    for (const href of hrefs) {
      const url = new URL(href, page.url());
      const response = await request.get(url.pathname);
      expect(response.status(), href).toBe(200);
      if (url.hash) expect(await response.text(), href).toContain(`id="${url.hash.slice(1)}"`);
    }
  }
  await page.goto('/');
  const ids = await page.locator('main > section').evaluateAll(sections => sections.map(s => s.id || s.className));
  expect(ids).toEqual(['hero', 'why', 'how-it-works', 'conversation', 'paths', 'apps', 'safety', 'privacy', 'ecosystem', 'cta']);
  await expect(page.locator('.tradition-card')).toHaveCount(7);
  await expect(page.locator('.tradition-card .status', { hasText: '준비 중' })).toHaveCount(7);
  await expect(page.getByRole('link', { name: /다운로드/ })).toHaveCount(0);
  expect((await request.get('/not-an-onaria-page')).status()).toBe(404);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect((sitemap.match(/<loc>/g) || []).length).toBe(6);
  expect(sitemap).not.toContain('/admin');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /admin');
});

test('keyboard, interactive journey and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '본문 바로가기' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const menu = page.getByRole('button', { name: '메뉴' });
  await menu.focus(); await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(page.locator('#site-nav a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.locator('#site-nav')).toBeHidden();
  const second = page.locator('.journey summary').nth(1);
  await second.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.journey details').nth(1)).toHaveAttribute('open', '');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto');
  expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)).toBe(0);
});

for (const width of [390, 768, 1440]) {
  test(`visual checkpoints and bounds ${width}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.locator('.hero-art img').evaluate(img => img.decode());
    for (const selector of ['.hero', '#how-it-works', '#paths', '#apps', '#safety']) {
      const section = page.locator(selector);
      await section.scrollIntoViewIfNeeded();
      await section.screenshot({ path: testInfo.outputPath(`${width}-${selector.replace(/[.#]/g, '')}.png`) });
      const bounds = await section.locator('h1,h2,h3,p,a,summary,article').evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect(); return { x: r.x, right: r.right, width: innerWidth };
      }));
      expect(bounds.every(r => r.x >= -1 && r.right <= r.width + 1)).toBe(true);
    }
  });
}
