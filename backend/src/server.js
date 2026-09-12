import 'dotenv/config';
import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';
import { createAdminSettings } from './admin_settings.js';
import { createRuntimeUsageLedger } from './cost/runtime_ledger.js';
import { createRuntimeIdentity } from './auth/identity_verifier.js';
import { createWebMetrics } from './web_metrics.js';
import { createMemberStore } from './member_store.js';

const port = Number(process.env.PORT || 8787);
// Defaults to local; only all three explicit OpenAI settings enable the provider.
const usageLedger = createRuntimeUsageLedger();
const webMetrics = createWebMetrics();
const adminSettings = createAdminSettings({ directory: fileURLToPath(new URL('../data/admin-secrets/', import.meta.url)), usageLedger, onResult: event => webMetrics.result(event) });
const generate = adminSettings.generate;
const memberStore = createMemberStore(process.env.MEMBER_DB_PATH ? { filename: process.env.MEMBER_DB_PATH } : {});
const app = createApp({
  generate,
  adminSettings,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean),
  appToken: process.env.APP_BEARER_TOKEN || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  identity: createRuntimeIdentity(),
  webMetrics,
  memberStore,
  production: process.env.NODE_ENV === 'production',
  trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY.split(',').map(v => v.trim()) : false,
  publicOrigin: process.env.PUBLIC_ORIGIN || 'https://onaria.ai.kr',
  allowAdminBearer: process.env.NODE_ENV !== 'production' || process.env.ADMIN_ALLOW_BEARER === 'true',
});
const host = process.env.HOST || '0.0.0.0';
const server = app.listen(port, host, () => console.log(`onaria backend listening on ${host}:${port} (${generate.mode})`));
server.on('close', () => { usageLedger.close?.(); memberStore.close(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
