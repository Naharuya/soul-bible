"""Linux-only, temporary fixtures: never calls real systemctl/npm/network."""
import hashlib
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
import zipfile

SCRIPT = pathlib.Path(__file__).with_name('deploy-cafe24.sh').resolve()

def shell_path(path):
    value = str(path).replace('\\', '/')
    return '/' + value[0].lower() + value[2:] if os.name == 'nt' else value

class Deployment(unittest.TestCase):
    def run_fixture(self, failure='', malicious=False):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            backend = root / 'backend'
            backend.mkdir()
            persistent = {'.env': 'PRIVATE_FIXTURE', 'data/members.sqlite': 'DATABASE', 'data/admin-secrets/master.key': 'MASTER', 'data/admin-secrets/settings.enc': 'ENCRYPTED'}
            old = {'src/server.js': 'OLD', 'public/admin.html': 'OLD', 'package.json': '{}', 'package-lock.json': '{}', 'node_modules/old.txt': 'DEPENDENCY'}
            for name, value in (persistent | old).items():
                p = backend / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(value)
            archive = root / 'onaria-backend-deploy.zip'
            new = {'src/server.js': 'NEW', 'public/admin.html': 'NEW', 'package.json': '{}', 'package-lock.json': '{}', 'config/retrieval-concepts.json': '{}', 'config/tradition-branches.json': '{}', 'production-corpus-policy/test.json': '{}'}
            with zipfile.ZipFile(archive, 'w') as z:
                for name, value in new.items():
                    z.writestr('backend/' + name, value)
                if malicious:
                    z.writestr('backend/../outside', 'REJECT')
            pathlib.Path(str(archive) + '.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest())
            mocks = root / 'bin'
            mocks.mkdir()
            commands = {
                'systemctl': '#!/bin/bash\nif [[ "$1" == restart && "$FAILURE" == restart ]] && grep -q NEW "$ONARIA_BACKEND_DIR/src/server.js"; then exit 1; fi\nexit 0\n',
                'npm': '#!/bin/bash\nmkdir -p node_modules; echo NEW > node_modules/new.txt\n[[ "$FAILURE" != npm ]]\n',
                'curl': '#!/bin/bash\nif [[ "$FAILURE" == health ]] && grep -q NEW "$ONARIA_BACKEND_DIR/src/server.js"; then exit 1; fi\necho \'{"status":"ok"}\'\n',
                'sleep': '#!/bin/bash\nexit 0\n',
            }
            if os.name == 'nt':
                # Windows validation uses Git Bash; real flock is exercised on Linux CI.
                commands['flock'] = '#!/bin/bash\nexit 0\n'
                commands['python3'] = '#!/bin/bash\n"' + shell_path(sys.executable) + '" "$@"\n'
            for name, contents in commands.items():
                p = mocks / name
                p.write_text(contents)
                p.chmod(0o755)
            env = dict(os.environ, ONARIA_BACKEND_DIR=shell_path(backend), ONARIA_BACKUP_DIR=shell_path(root / 'backups'), FAILURE=failure,
                       MOCK_PATH=shell_path(mocks), DEPLOY_SCRIPT=shell_path(SCRIPT), ARCHIVE=shell_path(archive))
            bash = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'
            result = subprocess.run([bash, '-c', 'export PATH="$MOCK_PATH:$PATH"; bash "$DEPLOY_SCRIPT" "$ARCHIVE"'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode == 0, not failure and not malicious, result.stdout + result.stderr)
            for name, value in persistent.items():
                self.assertEqual((backend / name).read_text(), value)
            self.assertEqual((backend / 'src/server.js').read_text(), 'OLD' if failure or malicious else 'NEW')
            if failure:
                self.assertIn('ROLLBACK HEALTH OK', result.stdout)
                self.assertEqual((backend / 'node_modules/old.txt').read_text(), 'DEPENDENCY')
                self.assertFalse((backend / 'node_modules/new.txt').exists())
            if not malicious:
                snapshots = list((root / 'backups').glob('deploy-*/previous/.env'))
                self.assertEqual(len(snapshots), 1)
                self.assertEqual(snapshots[0].read_text(), 'PRIVATE_FIXTURE')

    def test_success_preserves_data(self): self.run_fixture()
    def test_npm_failure_rolls_back(self): self.run_fixture('npm')
    def test_health_failure_rolls_back(self): self.run_fixture('health')
    def test_restart_failure_rolls_back(self): self.run_fixture('restart')
    def test_traversal_rejected_before_changes(self): self.run_fixture(malicious=True)

if __name__ == '__main__': unittest.main()
