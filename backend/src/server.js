import 'dotenv/config';
import { createApp } from './app.js';
import { fileURLToPath } from 'node:url';
import { createAdminSettings } from './admin_settings.js';
import { createRuntimeUsageLedger } from './cost/runtime_ledger.js';
import { createRuntimeIdentity } from './auth/identity_verifier.js';

const port = Number(process.env.PORT || 8787);
// Defaults to local; only all three explicit OpenAI settings enable the provider.
const usageLedger = createRuntimeUsageLedger();
const adminSettings = createAdminSettings({ directory: fileURLToPath(new URL('../data/admin-secrets/', import.meta.url)), usageLedger });
const generate = adminSettings.generate;
const app = createApp({
  generate,
  adminSettings,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean),
  appToken: process.env.APP_BEARER_TOKEN || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  identity: createRuntimeIdentity(),
});
const host = process.env.HOST || '0.0.0.0';
const server = app.listen(port, host, () => console.log(`onaria backend listening on ${host}:${port} (${generate.mode})`));
server.on('close', () => usageLedger.close?.());
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
