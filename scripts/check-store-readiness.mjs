import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPrivacyPolicy } from '../backend/src/privacy_policy.js';

const policy = loadPrivacyPolicy();
const corpus = JSON.parse(readFileSync(new URL('../assets/data/bible_verses_ko.json', import.meta.url), 'utf8'));
const blockers = [];
if (!policy.ready) blockers.push({ gate: 'privacy', missing: policy.missing, approved: policy.approved });
for (const verse of corpus.verses) {
  const a = verse.approval;
  const digest = createHash('sha256').update(JSON.stringify([verse.reference, verse.translation, verse.text, verse.englishText])).digest('hex');
  if (!a || a.status !== 'approved' || !a.reviewer?.trim() || !a.licenseEvidence?.trim() ||
    !Number.isFinite(Date.parse(a.reviewedAt)) || digest !== a.contentSha256) blockers.push({ gate: 'verse_approval', id: verse.id });
}
if (!corpus.verses.length) blockers.push({ gate: 'no_approved_verse_content' });
console.log(JSON.stringify({ status: blockers.length ? 'BLOCKED_RELEASE' : 'LOCAL_CONTENT_AND_PRIVACY_READY', blockers,
  limitation: 'Human evidence must be reviewed. This does not approve production deployment, account erasure identity checks, store declarations, payments or device tests.' }, null, 2));
if (blockers.length) process.exitCode = 1;
