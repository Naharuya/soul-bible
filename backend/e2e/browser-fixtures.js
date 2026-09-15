import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

// The isolated fixture trusts only its loopback proxy. Separate browser tests
// must not inherit another synthetic user's rate-limit bucket. Production
// thresholds are unchanged; backend tests exercise the real limiter directly.
export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    const hash = createHash('sha256').update(testInfo.testId).digest();
    await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.${hash[0]}.${hash[1]}.${hash[2]}` });
    await use(context);
  },
});
export { expect };
