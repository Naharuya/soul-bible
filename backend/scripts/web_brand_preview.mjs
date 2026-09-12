// Deterministic export of the existing vector BI, without external images/fonts.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('../public/website/onaria-emblem.svg', import.meta.url), 'utf8');
const browser = await chromium.launch(process.env.WEB_BROWSER_CHANNEL ? { channel: process.env.WEB_BROWSER_CHANNEL } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<html lang="ko"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:radial-gradient(ellipse at 80% 40%,#2b3d5a,#10182b 65%);color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;padding:80px;gap:40px}main{width:660px}h1{font-size:60px;font-weight:500;letter-spacing:.18em;margin:0 0 28px}h2{font-size:36px;line-height:1.6;font-weight:400;letter-spacing:-.03em;margin:0 0 30px}p{font-size:13px;letter-spacing:.14em;color:#bdcde5}svg{width:330px;height:330px;flex:none}</style></head><body><main><h1>ONARIA</h1><h2>모든 마음에는<br>저마다의 길이 있습니다.</h2><p>EVERY HEART HAS ITS OWN WAY</p></main>${svg}</body></html>`);
  await page.screenshot({ path: new URL('../public/website/social-preview.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1') });
} finally { await browser.close(); }
