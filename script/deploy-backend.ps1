[CmdletBinding()]
param(
    [string] $HostName = 'soul-bible-server'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

ssh $HostName 'mkdir -p /opt/soul-bible/backend'
scp -r "$root\backend\src" "$root\backend\package.json" "$root\backend\package-lock.json" "$HostName`:/opt/soul-bible/backend/"
scp "$PSScriptRoot\soul-bible-backend.service" "$HostName`:/tmp/soul-bible-backend.service"

ssh $HostName 'set -e; test -f /opt/soul-bible/backend/.env; mv /tmp/soul-bible-backend.service /etc/systemd/system/soul-bible-backend.service; chmod 600 /opt/soul-bible/backend/.env; cd /opt/soul-bible/backend; npm install --omit=dev --no-audit --no-fund; systemctl daemon-reload; systemctl enable soul-bible-backend; systemctl restart soul-bible-backend; systemctl --no-pager --full status soul-bible-backend; curl -fsS http://127.0.0.1:8787/health'
