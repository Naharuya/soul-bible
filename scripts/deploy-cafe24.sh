#!/usr/bin/env bash
# No Git on the server. Upload the ZIP, checksum and this script separately.
set -Eeuo pipefail
umask 077
backend="${ONARIA_BACKEND_DIR:-/opt/soul-bible/backend}"
backup_root="${ONARIA_BACKUP_DIR:-/opt/onaria-backups}"
service=soul-bible-backend
archive="$(realpath -e -- "${1:?Usage: bash deploy-cafe24.sh /path/onaria-backend-deploy.zip}")"
for command in python3 npm node systemctl curl cp mv flock sha256sum; do command -v "$command" >/dev/null; done
backend="$(realpath -e -- "$backend")"
[[ "$backend" != / && "$(basename -- "$backend")" == backend && -f "$backend/.env" ]]
mkdir -p -- "$backup_root"
backup_root="$(realpath -e -- "$backup_root")"
case "$backup_root/" in "$backend/"*) echo 'Backup directory must be outside backend'; exit 1;; esac
exec 9>"$backup_root/.deploy.lock"
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
expected="$(tr -d '\r\n' < "$archive.sha256")"
[[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]]
actual="$(sha256sum -- "$archive")"
[[ "${actual%% *}" == "$expected" ]] || { echo 'ZIP checksum mismatch'; exit 1; }
work="$(mktemp -d "$backup_root/deploy-$(date +%Y%m%d-%H%M%S)-XXXXXX")"
chmod 700 "$work"
# Validate all members before extracting: no traversal, links, devices or data.
python3 - "$archive" "$work/new" <<'PY'
import os, pathlib, stat, sys, zipfile
archive, destination = sys.argv[1:]
roots = ('backend/src/', 'backend/public/', 'backend/production-corpus-policy/')
files = {'backend/package.json', 'backend/package-lock.json', 'backend/config/retrieval-concepts.json', 'backend/config/tradition-branches.json'}
with zipfile.ZipFile(archive) as z:
    seen = set()
    if sum(i.file_size for i in z.infolist()) > 200 * 1024 * 1024:
        raise ValueError('Package exceeds size limit')
    for i in z.infolist():
        p = pathlib.PurePosixPath(i.filename)
        mode = i.external_attr >> 16
        if p.is_absolute() or '..' in p.parts or '\\' in i.filename or i.filename in seen:
            raise ValueError('Unsafe ZIP path')
        seen.add(i.filename)
        if stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise ValueError('ZIP links/devices are forbidden')
        if i.is_dir():
            if i.filename not in ('backend/', 'backend/config/') and not i.filename.startswith(roots):
                raise ValueError('Unexpected ZIP directory')
        elif i.filename not in files and not i.filename.startswith(roots):
            raise ValueError('Unexpected ZIP file')
        if any(s in ('.env', 'data', 'node_modules', 'master.key', 'settings.enc') or s.endswith(('.sqlite', '.db', '.sqlite-wal', '.sqlite-shm')) for s in p.parts):
            raise ValueError('Persistent data is forbidden')
    required = files | {'backend/src/server.js', 'backend/public/admin.html'}
    if not required.issubset(seen):
        raise ValueError('Incomplete ZIP')
    z.extractall(destination)
    # Runtime code is public/readable; persistent secrets are never extracted.
    for directory, _, filenames in os.walk(destination):
        os.chmod(directory, 0o755)
        for filename in filenames:
            os.chmod(os.path.join(directory, filename), 0o644)
PY
items=(src public package.json package-lock.json config/retrieval-concepts.json config/tradition-branches.json production-corpus-policy)
for item in "${items[@]}" node_modules config; do
  [[ ! -L "$backend/$item" ]] || { echo "Refusing symlink: $item"; exit 1; }
done
stopped=0
changed=0
health() {
  local attempt
  for attempt in {1..20}; do
    if systemctl is-active --quiet "$service" && curl --fail --silent --max-time 3 http://127.0.0.1:8787/health > "$work/health.json" &&
      node -e 'const fs=require("fs");process.exit(JSON.parse(fs.readFileSync(process.argv[1])).status === "ok" ? 0 : 1)' "$work/health.json" 2>/dev/null; then return 0; fi
    sleep 2
  done
  return 1
}
recover() {
  local status=$?
  trap - ERR INT TERM
  set +e
  echo "Deployment failed. Backup: $work/previous"
  if (( changed )); then
    # Do not restore .env/data/DB: new writes must never be overwritten by a snapshot.
    systemctl stop "$service" || { echo 'STOP FAILED: manual recovery required'; exit 1; }
    local failed=0 item
    for item in "${items[@]}" node_modules; do
      if [[ -e "$backend/$item" || -L "$backend/$item" ]]; then
        mkdir -p -- "$work/failed/$(dirname "$item")"
        mv -- "$backend/$item" "$work/failed/$item" || failed=1
      fi
      if [[ -e "$work/previous/$item" ]]; then
        mkdir -p -- "$backend/$(dirname "$item")"
        cp -a -- "$work/previous/$item" "$backend/$item" || failed=1
      fi
    done
    (( failed == 0 )) || { echo 'RESTORE FAILED: manual recovery required'; exit 1; }
  fi
  if (( stopped )); then
    if systemctl restart "$service" && health; then echo 'ROLLBACK HEALTH OK'; else echo 'ROLLBACK FAILED: manual recovery required'; fi
  fi
  exit "${status:-1}"
}
trap recover ERR
trap 'false' INT TERM
systemctl stop "$service"
stopped=1
# Service is stopped for a consistent local SQLite/WAL snapshot. Symlinked/external
# databases remain in place and need their own backup process.
cp -a -- "$backend" "$work/previous"
changed=1
for item in "${items[@]}"; do
  mkdir -p -- "$work/replaced/$(dirname "$item")" "$backend/$(dirname "$item")"
  if [[ -e "$backend/$item" ]]; then mv -- "$backend/$item" "$work/replaced/$item"; fi
  cp -a -- "$work/new/backend/$item" "$backend/$item"
done
cd -- "$backend"
if ! (umask 022; npm ci --omit=dev) > "$work/npm-install.log" 2>&1; then
  echo 'Dependency installation failed; details are in the private backup directory.'
  false
fi
systemctl restart "$service"
health
trap - ERR INT TERM
echo "DEPLOYMENT OK. Backup: $work/previous"
echo 'Environment and persistent data preserved. Verify public HTTPS/Admin next.'
