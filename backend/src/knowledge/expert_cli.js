import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerSource, reviseSource, importExpertReviews, reviewTemplate, validateExpertRegistry } from './expert_registry.js';
import { religionIds } from '../agents/agent_contracts.js';
import { expertPackage, packageCsv } from './expert_package.js';
import { buildExpertIndex } from './expert_corpus.js';
import { createProductionIndex } from './production_index.js';
import { checkProductionReadiness } from './production_readiness.js';
import { evaluatePilot, releaseDecision, humanResponseTemplate } from '../evaluation/pilot_evaluation.js';
import { criticalSafetySuite } from '../evaluation/critical_safety.js';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2), { flag: 'wx' });
export async function expertCommand(args) {
  const [command, ...options] = args;
  const required = {
    intake: ['registry', 'source', 'output'], revise: ['registry', 'source', 'output'],
    package: ['registry', 'roster', 'output'], import: ['registry', 'roster', 'reviews', 'output'],
    build: ['registry', 'roster', 'tradition', 'root', 'version', 'corpus-version'],
    evaluate: ['registry', 'roster', 'gold', 'output'],
    release: ['pilot', 'regression', 'rollback', 'human-reviews', 'gold', 'root', 'traditions', 'output'],
  };
  if (!required[command]) throw new Error('Expected intake, revise, package, import, build, evaluate or release.');
  const values = {};
  for (let i = 0; i < options.length; i += 2) {
    const flag = options[i], key = flag?.slice(2), value = options[i + 1];
    if (!flag?.startsWith('--') || (!required[command].includes(key) && !(command === 'evaluate' && key === 'answers'))
        || Object.hasOwn(values, key) || !value || value.startsWith('--')) throw new Error('Invalid expert CLI option.');
    values[key] = value;
  }
  if (required[command].some(key => !values[key])) throw new Error('Missing expert CLI option.');
  if (command === 'release') {
    const traditions = values.traditions.split(',');
    const readiness = await checkProductionReadiness({ index: createProductionIndex(values.root), traditions });
    const criticalSafety = await criticalSafetySuite(await readJson(values.gold));
    const result = releaseDecision({ regression: await readJson(values.regression), readiness,
      pilot: await readJson(values.pilot), criticalSafety, rollback: await readJson(values.rollback),
      traditions, humanReviews: await readJson(values['human-reviews']) });
    await writeJson(values.output, { ...result, readiness, criticalSafety }); return result;
  }
  const registry = await readJson(values.registry);
  if (command === 'intake' || command === 'revise') {
    const result = (command === 'intake' ? registerSource : reviseSource)(registry, await readJson(values.source));
    await writeJson(values.output, result); return { sources: result.sources.length };
  }
  const roster = await readJson(values.roster);
  validateExpertRegistry(registry, roster);
  if (command === 'import') {
    const result = importExpertReviews(registry, await readJson(values.reviews), roster);
    await writeJson(values.output, result); return { sources: result.sources.length, statuses: result.sources.map(row => ({ sourceId: row.sourceId, reviewStatus: row.reviewStatus })) };
  }
  if (command === 'package') {
    const pack = expertPackage(registry);
    await mkdir(values.output, { recursive: true });
    await writeJson(join(values.output, 'sources.json'), pack);
    await writeFile(join(values.output, 'sources.csv'), packageCsv(pack), { flag: 'wx' });
    await writeJson(join(values.output, 'templates.json'), religionIds.map(reviewTemplate));
    await writeJson(join(values.output, 'submission.json'), { environment: pack.environment, registryFingerprint: pack.registryFingerprint,
      decisions: pack.rows.map(row => row.nextReview).filter(Boolean) });
    return { sources: pack.rows.length, output: values.output };
  }
  if (command === 'build') return buildExpertIndex({ registry, roster, tradition: values.tradition,
    index: createProductionIndex(values.root), indexVersion: values.version, corpusVersion: values['corpus-version'] });
  const questions = await readJson(values.gold);
  const result = await evaluatePilot({ registry, roster, questions, answers: values.answers ? await readJson(values.answers) : [] });
  const criticalSafety = await criticalSafetySuite(questions);
  await mkdir(values.output, { recursive: true });
  await writeJson(join(values.output, 'pilot-evaluation.json'), result);
  await writeJson(join(values.output, 'human-response-review.json'), result.humanReviews);
  await writeJson(join(values.output, 'human-response-template.json'), humanResponseTemplate());
  await writeJson(join(values.output, 'critical-safety.json'), criticalSafety);
  return { actualCorpusApproval: result.actualCorpusApproval, traditions: result.traditions, criticalSafety: criticalSafety.status };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await expertCommand(process.argv.slice(2)); console.log(JSON.stringify(result, null, 2));
    if (result.status === 'BLOCKED_RELEASE') process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
