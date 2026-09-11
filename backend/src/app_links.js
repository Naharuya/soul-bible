import { Router } from 'express';

const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function appLinksRouter(env = process.env) {
  const router = Router();
  const android = httpsUrl(env.ONARIA_ANDROID_INSTALL_URL);
  const ios = httpsUrl(env.ONARIA_IOS_INSTALL_URL);
  const fingerprints = (env.ONARIA_ANDROID_SHA256 ?? '').split(',').map((v) => v.trim().toUpperCase())
    .filter((v) => /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v));
  const appleId = env.ONARIA_APPLE_APP_ID ?? '';
  router.get('/.well-known/assetlinks.json', (_req, res) => res.json(fingerprints.length ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'com.example.bible_mind_core', sha256_cert_fingerprints: fingerprints },
  }] : []));
  router.get('/.well-known/apple-app-site-association', (_req, res) => res.json({
    applinks: { apps: [], details: /^[A-Z0-9]{10}\.com\.example\.bibleMindCore$/.test(appleId)
      ? [{ appID: appleId, paths: ['/app/open'] }] : [] },
  }));
  router.get(['/app', '/app/open'], (_req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>onaria 앱 열기</title><link rel="stylesheet" href="/app/style.css"></head>
<body><main><p>onaria</p><h1>마음에 작은 쉼을</h1>
<p>나에게 도착한 마음 카드와 함께, 오늘의 마음을 돌아보세요.</p>
<a class="button" href="onaria://app/open">설치된 앱 열기</a>
<h2>앱이 없다면 설치해 주세요</h2>
${android ? `<a class="button secondary" href="${escapeHtml(android)}">Android 앱 설치</a>` : '<p>Android 설치 링크를 준비 중이에요.</p>'}
${ios ? `<a class="button secondary" href="${escapeHtml(ios)}">iPhone 앱 설치</a>` : '<p>iPhone 설치 링크를 준비 중이에요.</p>'}
<p>앱이 열리지 않으면 브라우저에서 이 페이지를 열어 다시 시도해 주세요.</p>
</main></body></html>`);
  });
  router.get('/app/style.css', (_req, res) => res.type('css').send(
    'body{margin:0;background:#f6f4ed;color:#263d36;font:18px/1.7 system-ui,sans-serif}main{max-width:440px;margin:auto;padding:64px 24px}h1{font-size:32px}h2{font-size:22px;margin-top:36px}.button{display:block;background:#35594b;color:white;text-align:center;text-decoration:none;padding:14px 20px;border-radius:16px;margin:16px 0}.secondary{background:#e3e9df;color:#263d36}'));
  return router;
}
