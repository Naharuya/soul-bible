import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { knowledgeRecordSchema } from './contracts.js';
import { jsonKnowledgeStore, knowledgeNamespaces } from './provider.js';
import { productionEligible, validateCandidate, reviewCorpusSource } from './production_guard.js';

export function corpusReviewExport(records) {
  return records.map(input => {
    const record = knowledgeRecordSchema.parse(input);
    let candidateValid = false;
    try { validateCandidate(record); candidateValid = true; } catch { /* Report invalid candidate without raw content. */ }
    return { sourceId: record.sourceId, tradition: record.tradition, sourceTitle: record.title,
      licenseStatus: record.metadata.licenseStatus ?? (record.metadata.sample ? 'self_authored' : 'unknown'),
      reviewStatus: record.metadata.reviewStatus ?? 'development', branch: record.metadata.traditionBranch ?? null,
      reviewedBy: record.metadata.reviewedBy ?? null, reviewedAt: record.metadata.reviewedAt ?? null,
      approvalVersion: record.metadata.approvalVersion ?? null,
      candidateValid, productionApproved: productionEligible(record), question: null, retrievedSources: [], answer: null,
      retrievalConfidence: null, citationResult: 'not_run', integrityResult: 'not_run',
      reviewAccuracy: null, reviewTraditionIntegrity: null, reviewSafety: null, reviewCitation: null, reviewNotes: record.metadata.reviewNotes ?? '' };
  });
}

export async function reviewCorpusCommand(args) {
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--input', '--output', '--verify-production', '--status', '--reviewer', '--notes'].includes(flag) || seen.has(flag)) throw new Error('Unknown or duplicate CLI option.');
    seen.add(flag);
    if (flag !== '--verify-production' && (!args[++i] || args[i].startsWith('--'))) throw new Error('Missing CLI path.');
  }
  const inputFlag = args.indexOf('--input'); const outputFlag = args.indexOf('--output');
  if ((inputFlag >= 0 && !args[inputFlag + 1]) || (outputFlag >= 0 && !args[outputFlag + 1])) throw new Error('Missing CLI path.');
  const records = inputFlag >= 0 ? JSON.parse(await readFile(args[inputFlag + 1], 'utf8'))
    : (await Promise.all(Object.values(knowledgeNamespaces).map(namespace => jsonKnowledgeStore.load(namespace)))).flat();
  if (!Array.isArray(records)) throw new Error('Expected corpus record array.');
  const value = flag => args[args.indexOf(flag) + 1];
  if (seen.has('--status')) {
    if (!seen.has('--input') || !seen.has('--output') || !seen.has('--reviewer') || seen.has('--verify-production') || !records.length) throw new Error('Review requires input, new output, reviewer and nonempty records.');
    const reviewed = records.map(record => knowledgeRecordSchema.parse(reviewCorpusSource(knowledgeRecordSchema.parse(record), {
      status: value('--status'), reviewer: value('--reviewer'), notes: seen.has('--notes') ? value('--notes') : '',
    })));
    await writeFile(value('--output'), JSON.stringify(reviewed, null, 2), { flag: 'wx' });
    return corpusReviewExport(reviewed);
  }
  if (seen.has('--reviewer') || seen.has('--notes')) throw new Error('Review options require status.');
  const report = corpusReviewExport(records);
  if (args.includes('--verify-production') && (!report.length || report.some(row => !row.productionApproved))) throw new Error('A nonempty approved corpus is required for production index.');
  if (outputFlag >= 0) await writeFile(args[outputFlag + 1], JSON.stringify(report, null, 2));
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await reviewCorpusCommand(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
