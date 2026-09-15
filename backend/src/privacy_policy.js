import { readFileSync } from 'node:fs';
import { z } from 'zod';

const text = z.string().trim().min(1).max(2000).nullable();
const schema = z.object({
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), approved: z.boolean(),
  operatorName: text, supportEmail: z.string().email().nullable(),
  memberRetention: text, usageRetention: text,
  reportsRetentionDays: z.number().int().min(1).max(365).nullable(),
  internationalTransfer: text, aiProviders: z.array(z.string().trim().min(1).max(100)).min(1),
  reviewer: text, reviewedAt: z.string().datetime().nullable(),
}).strict();
export function privacyPolicy(input) {
  const policy = schema.parse(input);
  const required = ['operatorName', 'supportEmail', 'memberRetention', 'usageRetention',
    'reportsRetentionDays', 'internationalTransfer', 'reviewer', 'reviewedAt'];
  const missing = required.filter(key => policy[key] === null);
  const ready = policy.approved && missing.length === 0;
  return Object.freeze({ ...policy, ready, missing });
}
export function loadPrivacyPolicy() {
  return privacyPolicy(JSON.parse(readFileSync(new URL('../config/privacy-policy.json', import.meta.url), 'utf8')));
}
export function publicPrivacy(policy) {
  const { reviewer, reviewedAt, approved, ...publicFields } = policy;
  return { ...publicFields, registrationEnabled: false, deletionUrl: '/account-deletion' };
}
