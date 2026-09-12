import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2] || 'HEAD';
const output = resolve(process.argv[3] || resolve(root, 'build/onaria-backend-deploy.zip'));
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const sha = git(['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim();
// Explicit runtime configuration only, not reviewer registries or corpus exports.
const paths = ['backend/src', 'backend/public', 'backend/package.json', 'backend/package-lock.json',
  'backend/config/retrieval-concepts.json', 'backend/config/tradition-branches.json', 'backend/production-corpus-policy'];
const entries = git(['ls-tree', '-rz', sha, '--', ...paths]).toString().split('\0').filter(Boolean);
for (const entry of entries) {
  const [metadata, path] = entry.split('\t');
  if (!/^100(?:644|755) blob /.test(metadata) || /(?:^|\/)(?:\.env(?:\..*)?|data|node_modules|master\.key|settings\.enc)(?:\/|$)|\.(?:sqlite(?:-wal|-shm)?|db)$/i.test(path)) {
    throw Error(`Disallowed package entry: ${path}`);
  }
  const bytes = git(['show', `${sha}:${path}`]);
  if (/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{60,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|GOCSPX-[\w-]{20,}/.test(bytes.toString())) {
    throw Error(`Credential pattern found in ${path}; value withheld`);
  }
}
if (!entries.length) throw Error('Empty deployment package');
mkdirSync(dirname(output), { recursive: true });
git(['archive', '--format=zip', `--output=${output}`, sha, '--', ...paths]);
const digest = createHash('sha256').update(readFileSync(output)).digest('hex');
writeFileSync(output + '.sha256', `${digest}\n`);
writeFileSync(output + '.source.json', JSON.stringify({ commit: sha, files: entries.length, sha256: digest, paths }, null, 2) + '\n');
console.log(JSON.stringify({ commit: sha, files: entries.length, output, sha256: digest }));
