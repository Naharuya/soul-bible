#!/usr/bin/env bash
set -euo pipefail
domain=lightshare8.mycafe24.com
mkdir -p /var/www/soul-bible-acme/.well-known/acme-challenge
cp -a /etc/httpd/conf.d/soul-bible.conf "/etc/httpd/conf.d/soul-bible.conf.backup-$(date +%Y%m%d%H%M%S)"
cat > /etc/httpd/conf.d/soul-bible.conf <<'CONF'
<VirtualHost *:80>
    ServerName lightshare8.mycafe24.com
    ProxyRequests Off
    ProxyPreserveHost On
    RequestHeader unset X-Forwarded-For
    ProxyPass /.well-known/acme-challenge/ !
    Alias /.well-known/acme-challenge/ /var/www/soul-bible-acme/.well-known/acme-challenge/
    <Directory /var/www/soul-bible-acme>
        Require all granted
    </Directory>
    ProxyPass / http://127.0.0.1:8787/ timeout=120
    ProxyPassReverse / http://127.0.0.1:8787/
</VirtualHost>
CONF
restorecon -R /var/www/soul-bible-acme || true
httpd -t
systemctl reload httpd
certbot certonly --webroot -w /var/www/soul-bible-acme -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email
cat > /etc/httpd/conf.d/soul-bible-https.conf <<'CONF'
<VirtualHost *:443>
    ServerName lightshare8.mycafe24.com
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/lightshare8.mycafe24.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/lightshare8.mycafe24.com/privkey.pem
    SSLProtocol -all +TLSv1.2 +TLSv1.3
    ProxyRequests Off
    ProxyPreserveHost On
    RequestHeader unset X-Forwarded-For
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:8787/ timeout=120
    ProxyPassReverse / http://127.0.0.1:8787/
</VirtualHost>
CONF
# Redirect only the admin entry point; existing mobile API clients keep working.
sed -i '/ServerName lightshare8.mycafe24.com/a\    RedirectMatch 302 ^/admin$ https://lightshare8.mycafe24.com/admin/\n    Redirect /admin/ https://lightshare8.mycafe24.com/admin/' /etc/httpd/conf.d/soul-bible.conf
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/soul-bible-httpd.sh <<'HOOK'
#!/usr/bin/env bash
set -e
httpd -t
systemctl reload httpd
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/soul-bible-httpd.sh
httpd -t
systemctl reload httpd
systemctl enable --now certbot-renew.timer
curl --fail --silent --show-error "https://$domain/health"
