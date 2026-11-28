# Deploying ShopSphere on your own Ubuntu server

An alternative to the free cloud stack (`DEPLOYMENT.md`): everything on one Ubuntu 24.04 LTS server. nginx serves the website and forwards `/api` to the Node API, PostgreSQL runs on the same machine, systemd keeps the API running, Let's Encrypt provides HTTPS.

> **Status of this guide:** written against Ubuntu 24.04 LTS and checked for consistency with the repository, but **not executed on a real server by the author** (the project was developed on Windows). Try it on a fresh, disposable VM first and report any step that differs.

Architecture on the server:

```
Browser ──https──> nginx ─┬─ /            static files from /var/www/shopsphere
                          └─ /api/*  ───> Node API on 127.0.0.1:4000 ──> PostgreSQL on localhost
```

Because the site and the API share one address, the login cookie is first-party and works in every browser.

## 0. What you need
- An Ubuntu 24.04 server with a public IP (1 vCPU / 1 GB RAM is enough for a demo; 2 GB is comfortable), and sudo access.
- A domain name with an **A record** pointing at the server (for HTTPS). Below it is `shop.example.com`; replace it everywhere.
- Your Cloudinary credentials (product images are hosted there).

## 1. Install the software
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx postgresql postgresql-contrib git curl ufw certbot python3-certbot-nginx rsync

# Node.js 22 and pnpm (the repository pins pnpm 12.23.0)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
sudo npm install -g pnpm@12.23.0
node -v && pnpm -v && psql --version     # expect Node 22.x, pnpm 12.23.0, PostgreSQL 16
```

## 2. Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```
PostgreSQL and the API listen on localhost only and are not opened.

## 3. Database
Choose a database password made only of letters and digits (no `#`, `@`, `:` or `/`, which break connection URLs):
```bash
DBPASS=$(openssl rand -hex 16); echo "$DBPASS"        # save this somewhere safe
sudo -u postgres psql <<SQL
CREATE USER shopsphere WITH PASSWORD '$DBPASS';
CREATE DATABASE shopsphere OWNER shopsphere;
SQL
```
The migrations create the `pg_trgm` extension themselves (it is a "trusted" extension, so the database owner may create it).

## 4. Get the code
```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin shopsphere
sudo mkdir -p /opt/shopsphere && sudo chown shopsphere:shopsphere /opt/shopsphere
sudo -u shopsphere git clone https://github.com/karthicbabuk-kg/shopsphere.git /opt/shopsphere
cd /opt/shopsphere
sudo -u shopsphere pnpm install --frozen-lockfile --prod=false
```

## 5. Configuration (secrets stay out of git)
```bash
sudo mkdir -p /etc/shopsphere
sudo tee /etc/shopsphere/api.env >/dev/null <<EOF
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://shopsphere:$DBPASS@localhost:5432/shopsphere
DIRECT_URL=postgresql://shopsphere:$DBPASS@localhost:5432/shopsphere
DB_POOL_MAX=10
CORS_ORIGIN=https://shop.example.com
COOKIE_SAMESITE=lax
DEMO_MODE=true
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
EOF
sudo chown root:shopsphere /etc/shopsphere/api.env && sudo chmod 640 /etc/shopsphere/api.env
sudoedit /etc/shopsphere/api.env        # put in your real Cloudinary values and your domain
```
Notes: `DEMO_MODE=true` returns password-reset tokens on screen because there is no email delivery; set it to `false` for anything with real users. `CORS_ORIGIN` must be exactly `https://` plus your domain, with no trailing slash.

## 6. Build, migrate, seed
```bash
cd /opt/shopsphere
sudo -u shopsphere bash -c 'set -a; . /etc/shopsphere/api.env; set +a
  pnpm --filter @shopsphere/api prisma:generate
  pnpm --filter @shopsphere/api build
  pnpm --filter @shopsphere/web build
  pnpm --filter @shopsphere/api migrate:prod'

# One-time data. Choose your own admin password (letters and digits, at least 12 characters).
sudo -u shopsphere bash -c 'set -a; . /etc/shopsphere/api.env; set +a
  export SEED_ADMIN_EMAIL=admin@shop.example.com SEED_ADMIN_PASSWORD="CHANGE-ME-to-a-long-password1"
  pnpm --filter @shopsphere/api seed:prod
  pnpm --filter @shopsphere/api demo:seed:prod'      # optional: demo sellers, buyers, 39 products
```
Skip the `demo:seed:prod` line for an empty store. Demo account passwords are listed in `DEMO_CREDENTIALS.md`; change `DEMO_PASSWORD` in `apps/api/src/database/demo-data.ts` before seeding if the server is public.

## 7. Run the API with systemd
```bash
sudo tee /etc/systemd/system/shopsphere-api.service >/dev/null <<'EOF'
[Unit]
Description=ShopSphere API
After=network.target postgresql.service

[Service]
User=shopsphere
Group=shopsphere
WorkingDirectory=/opt/shopsphere
EnvironmentFile=/etc/shopsphere/api.env
ExecStart=/usr/bin/node apps/api/dist/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now shopsphere-api
curl -s localhost:4000/api/v1/health        # {"success":true,"data":{"status":"ok","db":"up",...}}
journalctl -u shopsphere-api -n 50 --no-pager   # logs; passwords and tokens are redacted
```

## 8. Publish the website and set up nginx
```bash
sudo mkdir -p /var/www/shopsphere
sudo rsync -a --delete --exclude _headers /opt/shopsphere/apps/web/dist/ /var/www/shopsphere/

# Security headers, shared by every location (nginx drops server-level headers inside a location that sets its own).
sudo tee /etc/nginx/snippets/shopsphere-headers.conf >/dev/null <<'EOF'
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://res.cloudinary.com; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
EOF

sudo tee /etc/nginx/sites-available/shopsphere >/dev/null <<'EOF'
server {
    listen 80;
    server_name shop.example.com;

    root /var/www/shopsphere;
    index index.html;
    client_max_body_size 8m;          # product image uploads (the API limits files to 5 MB each)
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    location /api/ {
        include snippets/shopsphere-headers.conf;
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /assets/ {
        include snippets/shopsphere-headers.conf;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    location / {
        include snippets/shopsphere-headers.conf;
        try_files $uri /index.html;    # single-page app: unknown paths get the app
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/shopsphere /etc/nginx/sites-enabled/shopsphere
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
Replace `shop.example.com` with your domain before running (the file is written exactly as shown). The headers include `Strict-Transport-Security`, which only takes effect once HTTPS is on (next step). The API itself trusts exactly one proxy hop (nginx), so rate limiting and logs see real client addresses.

## 9. HTTPS
```bash
sudo certbot --nginx -d shop.example.com --agree-tos -m you@example.com --redirect
sudo systemctl status certbot.timer        # certificates renew automatically
```
Open `https://shop.example.com`. Check `https://shop.example.com/api/v1/health`.

## 10. Backups
```bash
sudo mkdir -p /var/backups/shopsphere && sudo chown postgres:postgres /var/backups/shopsphere
sudo tee /etc/cron.d/shopsphere-backup >/dev/null <<'EOF'
15 2 * * * postgres pg_dump -Fc shopsphere > /var/backups/shopsphere/shopsphere-$(date +\%F).dump && find /var/backups/shopsphere -name '*.dump' -mtime +14 -delete
EOF
```
Restore into an empty database: `sudo -u postgres pg_restore -d shopsphere --clean --if-exists /var/backups/shopsphere/shopsphere-YYYY-MM-DD.dump`. Copy dumps off the server too; a backup on the same disk does not survive losing the disk.

## 11. Updating
```bash
cd /opt/shopsphere
sudo -u shopsphere git pull --ff-only
sudo -u shopsphere pnpm install --frozen-lockfile --prod=false
sudo -u shopsphere bash -c 'set -a; . /etc/shopsphere/api.env; set +a
  pnpm --filter @shopsphere/api prisma:generate
  pnpm --filter @shopsphere/api build
  pnpm --filter @shopsphere/web build
  pnpm --filter @shopsphere/api migrate:prod'
sudo rsync -a --delete --exclude _headers apps/web/dist/ /var/www/shopsphere/
sudo systemctl restart shopsphere-api
```
Never edit a migration that has been applied; add a new one.

## 12. Verify
| Check | Expected |
|---|---|
| `curl -s https://shop.example.com/api/v1/health` | `"status":"ok","db":"up"` |
| Home page, product images | products and images load |
| Sign in as a demo buyer, reload the page | still signed in |
| `curl -sI https://shop.example.com/ \| grep -i -E "strict-transport\|content-security\|x-frame"` | all three present |
| `sudo systemctl restart shopsphere-api` then reload the site | recovers within seconds |

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| `502 Bad Gateway` on `/api/` | API not running: `systemctl status shopsphere-api`, `journalctl -u shopsphere-api` |
| API exits with "Invalid environment configuration" | a variable is missing in `/etc/shopsphere/api.env` (the log names it) |
| Signed out on every reload | `CORS_ORIGIN` does not exactly match `https://your-domain`, or `COOKIE_SAMESITE` was changed |
| Migration fails with a permissions error | the `shopsphere` database user does not own the database (re-run section 3) |
| Certbot fails | the domain's A record does not point at this server yet, or port 80 is blocked |
| Images missing | Cloudinary values missing or wrong in `api.env` |
