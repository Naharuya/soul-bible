#!/usr/bin/env bash
set -euo pipefail

cd /opt/soul-bible/backend
new_admin_token="$(openssl rand -hex 24)"
sed -i '/^ADMIN_TOKEN=/d' .env
printf 'ADMIN_TOKEN=%s\n' "$new_admin_token" >> .env
chmod 600 .env
systemctl restart soul-bible-backend
sleep 1

status="$(curl -sS -o /tmp/soul-bible-admin-check.json -w '%{http_code}' \
  -H "Authorization: Bearer $new_admin_token" \
  http://127.0.0.1:8787/v1/admin/overview)"
test "$status" = "200"
grep -q '"operational"' /tmp/soul-bible-admin-check.json
rm -f /tmp/soul-bible-admin-check.json
unset new_admin_token
echo 'ADMIN_TOKEN_ROTATED=true'
echo 'AUTH_ADMIN_HTTP=200'
