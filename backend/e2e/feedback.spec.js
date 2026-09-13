import { test, expect } from '@playwright/test';

test('anonymous category feedback appears only in the authenticated analytics screen', async ({ page, request }) => {
  const response = await request.post('/v1/feedback', { data: {
    submissionId: 'e'.repeat(32), rating: 'helpful', reason: 'voice',
  } });
  expect(response.status()).toBe(202);
  expect((await request.get('/v1/admin/feedback')).status()).toBe(401);
  await page.goto('/admin/analytics');
  await expect(page.locator('#dashboard')).toBeHidden();
  await page.locator('#tokenInput').fill('onaria-browser-test-only');
  await page.getByRole('button', { name: '대시보드 열기' }).click();
  await expect(page.locator('#feedbackCounts')).toContainText('도움됐어요 · 음성 · 1건');
  await page.locator('#logoutButton').click();
  await expect(page.locator('#dashboard')).toBeHidden();
});
