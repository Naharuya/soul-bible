import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createProductionIndex } from './production_index.js';
import { checkProductionReadiness } from './production_readiness.js';
import { knowledgeNamespaces } from './namespaces.js';

export async function productionCommand(args) {
  const [command, ...options] = args;
  const allowed = {
    build: ['--root', '--input', '--version', '--corpus-version', '--tradition'],
    activate: ['--root', '--version'], rollback: ['--root', '--tradition'],
    readiness: ['--root', '--tradition'], status: ['--root'],
  };
  if (!allowed[command]) throw new Error('Expected build, activate, rollback, readiness or status.');
  const values = {};
  for (let i = 0; i < options.length; i += 2) {
    const key = options[i], value = options[i + 1];
    if (!allowed[command].includes(key) || Object.hasOwn(values, key) || !value || value.startsWith('--')) throw new Error('Invalid CLI options.');
    values[key] = value;
  }
  if (allowed[command].some(key => !(key in values) && !(command === 'readiness' && key === '--tradition'))) throw new Error('Missing required option.');
  const index = createProductionIndex(values['--root']);
  if (command === 'build') return index.build({ indexVersion: values['--version'], corpusVersion: values['--corpus-version'],
    tradition: values['--tradition'], records: JSON.parse(await readFile(values['--input'], 'utf8')) });
  if (command === 'activate') return index.activate(values['--version']);
  if (command === 'rollback') return index.rollback(values['--tradition']);
  if (command === 'status') return index.registry();
  return checkProductionReadiness({ index, traditions: values['--tradition'] ? [values['--tradition']] : Object.keys(knowledgeNamespaces) });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await productionCommand(process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    if (result.status?.startsWith('BLOCKED_')) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
