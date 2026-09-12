// Isolated browser-test server: no dotenv, real DB, external AI or production credentials.
import { createApp } from '../src/app.js';
const generate = async () => { throw Error('Chat is disabled in the web fixture'); };
generate.mode = 'local conversation';
const app = createApp({ generate, memberStore: { getAdminOverview: () => ({ total: 0, recent: [] }) },
  adminToken: 'onaria-browser-test-only', adminSettings: { status: () => ({ configured: false, mode: 'local conversation' }), update: () => ({ configured: false }) },
  publicOrigin: 'http://127.0.0.1:8799' });
const server = app.listen(8799, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
