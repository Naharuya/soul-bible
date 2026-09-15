import { test, expect } from './browser-fixtures.js';

test('AI report renders attachment as text, reviews with CSRF, clears after logout', async ({page}) => {
  let reviewed = false;
  const attachment = '<img src=x onerror="window.reportXss=true">Fixture response';
  await page.route('**/v1/admin/reports', route => route.fulfill({json:{available:true,reports:[{
    id:'a'.repeat(32),reason:'unsafe',responseText:attachment,createdAt:Date.now(),status:reviewed?'reviewed':'pending'
  }]}}));
  await page.route('**/v1/admin/reports/*/review', async route => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['x-csrf-token']).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({confirmation:'REVIEWED'});
    reviewed = true; await route.fulfill({json:{}});
  });
  await page.goto('/admin/analytics');
  await page.locator('#tokenInput').fill('onaria-browser-test-only');
  await page.getByRole('button',{name:'대시보드 열기'}).click();
  await expect(page.locator('#contentReports pre')).toHaveText(attachment);
  expect(await page.evaluate(()=>window.reportXss)).toBeUndefined();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'검토 완료로 표시'}).click();
  await expect(page.locator('#contentReports')).toContainText('검토 완료');
  await page.locator('#logoutButton').click();
  await expect(page.locator('#contentReports')).toBeEmpty();
});

test('member erasure UI requires verification and exact confirmation without retaining form data', async ({page}) => {
  let deletions=0;
  await page.route('**/v1/admin/members/42',async route=>{
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().headers()['x-csrf-token']).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({confirmation:'DELETE_MEMBER:42',verificationReference:'FIXTURE-42'});
    deletions++;await route.fulfill({status:204});
  });
  await page.goto('/admin/content');
  await page.locator('#tokenInput').fill('onaria-browser-test-only');
  await page.getByRole('button',{name:'대시보드 열기'}).click();
  await page.locator('#eraseMemberId').fill('42');
  await page.locator('#eraseVerification').fill('FIXTURE-42');
  await page.getByRole('button',{name:'회원정보 삭제 확인'}).click();
  expect(deletions).toBe(0);
  await page.locator('#eraseVerified').check();
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'회원정보 삭제 확인'}).click();
  expect(deletions).toBe(0);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'회원정보 삭제 확인'}).click();
  await expect(page.locator('#eraseMemberStatus')).toContainText('삭제를 처리했습니다');
  expect(deletions).toBe(1);
  await expect(page.locator('#eraseVerification')).toHaveValue('');
  await page.locator('#logoutButton').click();
  await expect(page.locator('#eraseMemberStatus')).toBeEmpty();
});
