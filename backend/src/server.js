import 'dotenv/config';
import { createApp } from './app.js';
import { createConversationService } from './conversation_service.js';

const port = Number(process.env.PORT || 8787);
// Defaults to local; only all three explicit OpenAI settings enable the provider.
const generate = createConversationService();
const app = createApp({
  generate,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean),
  appToken: process.env.APP_BEARER_TOKEN || '',
  adminToken: process.env.ADMIN_TOKEN || '',
});
app.listen(port, () => console.log(`Soul Bible backend listening on :${port} (${generate.mode})`));
