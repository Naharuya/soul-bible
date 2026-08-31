import 'dotenv/config';
import { createApp } from './app.js';
import { createOpenAiService } from './openai_service.js';

const port = Number(process.env.PORT || 8787);
const model = process.env.OPENAI_MODEL || 'gpt-5.6';
const generate = createOpenAiService({ apiKey: process.env.OPENAI_API_KEY, model });
const app = createApp({
  generate,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean),
  appToken: process.env.APP_BEARER_TOKEN || '',
});
app.listen(port, () => console.log(`Soul Bible backend listening on :${port} (${model})`));
