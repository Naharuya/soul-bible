import 'dotenv/config';
import { createApp } from './app.js';
import { createConversationService } from './conversation_service.js';
import { createRuntimeUsageLedger } from './cost/runtime_ledger.js';
import { createRuntimeIdentity } from './auth/identity_verifier.js';

const port = Number(process.env.PORT || 8787);
// Defaults to local; only all three explicit OpenAI settings enable the provider.
const usageLedger = createRuntimeUsageLedger();
const generate = createConversationService({ usageLedger });
const app = createApp({
  generate,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean),
  appToken: process.env.APP_BEARER_TOKEN || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  identity: createRuntimeIdentity(),
});
const server = app.listen(port, () => console.log(`Soul Bible backend listening on :${port} (${generate.mode})`));
server.on('close', () => usageLedger.close?.());
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
