# IME365 — DEPLOYMENT READINESS REPORT
## Production Architecture, Environment Specifications & Operational Runbook

**Document ID:** IME365-DVR-013  
**Revision:** 4dd87154  
**Date:** 2026-10-30  
**Authority:** Antigravity Executive Engineering Lead & Release Gatekeeper  
**Status:** Certified Engineering Baseline  

---

## 1. PRODUCTION ARCHITECTURAL TOPOLOGY

The IME365 production architecture is designed for high availability, fault isolation, and horizontal scalability across three distinct tiers:

```
                            [ Public Internet ]
                                     │
                             ( Cloudflare CDN )
                         DDoS Defense & Edge Caching
                                     │
                             [ Nginx Gateway ]
                        TLS 1.3 Termination, Reverse Proxy
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
 ┌───────────────────────┐                           ┌───────────────────┐
 │ Static Asset Hosting  │                           │ PM2 Node Cluster  │
 │  frontend/dist/       │                           │  backend/server.js│
 └───────────────────────┘                           └─────────┬─────────┘
                                                               │
                       ┌───────────────────────────────────────┴───────────────┐
                       ▼                                                       ▼
            ┌─────────────────────┐                                 ┌─────────────────────┐
            │ MariaDB 10.4+ Primary│                                 │ Wasabi S3 Storage   │
            │  InnoDB ACID Engine │                                 │  Resume & Media Pool│
            └─────────────────────┘                                 └─────────────────────┘
```

---

## 2. PRODUCTION ENVIRONMENT CONFIGURATION CHECKLIST (`.env.production`)

All production secrets must be securely provided via environment variables. The application prohibits hardcoded fallbacks in production mode.

### A. Core Server & Runtime
```ini
NODE_ENV=production
PORT=5000
APP_URL=https://app.ime365.com
API_URL=https://app.ime365.com/api
CORS_ORIGIN=https://app.ime365.com
TRUST_PROXY=true
```

### B. MariaDB Persistent Database
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=ime365_prod_user
DB_PASSWORD=[SECURE_STRONG_PASSWORD_MIN_32_CHARS]
DB_NAME=ai_resume_builder
DB_CONNECTION_LIMIT=50
DB_QUEUE_LIMIT=0
DB_ACQUIRE_TIMEOUT=30000
```

### C. Cryptography & Security Tokens
```ini
JWT_SECRET=[SECURE_CRYPTOGRAPHIC_RANDOM_64_BYTE_HEX]
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=[SECURE_CRYPTOGRAPHIC_RANDOM_64_BYTE_HEX]
JWT_REFRESH_EXPIRES_IN=7d
SESSION_SECRET=[SECURE_CRYPTOGRAPHIC_RANDOM_64_BYTE_HEX]
COOKIE_SECURE=true
COOKIE_SAME_SITE=strict
```

### D. Enterprise SAML 2.0 Identity Provider
```ini
SAML_SP_ENTITY_ID=https://app.ime365.com/api/enterprise/saml/metadata
SAML_SP_ACS_URL=https://app.ime365.com/api/enterprise/saml/acs
SAML_SP_PRIVATE_KEY_PATH=/etc/ime365/certs/saml-sp-private.pem
SAML_SP_CERT_PATH=/etc/ime365/certs/saml-sp-cert.pem
SAML_CLOCK_SKEW_SECONDS=300
```

### E. Commercial Payments (Stripe & Razorpay)
```ini
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=[RAZORPAY_LIVE_SECRET]
RAZORPAY_WEBHOOK_SECRET=[RAZORPAY_WEBHOOK_SECRET]
```

### F. Wasabi / S3 Cloud Object Storage
```ini
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_REGION=ap-south-1
WASABI_BUCKET=ime365-production-storage
WASABI_ACCESS_KEY=[WASABI_LIVE_ACCESS_KEY]
WASABI_SECRET_KEY=[WASABI_LIVE_SECRET_KEY]
```

### G. AI & WebRTC Services
```ini
OPENAI_API_KEY=sk-proj-...
LIVEKIT_URL=wss://livekit.ime365.com
LIVEKIT_API_KEY=[LIVEKIT_KEY]
LIVEKIT_API_SECRET=[LIVEKIT_SECRET]
```

### H. Transactional Mail Service
```ini
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=[SENDGRID_API_KEY]
SMTP_FROM=no-reply@ime365.com
```

---

## 3. PM2 PROCESS MANAGER CONFIGURATION (`ecosystem.config.cjs`)

```javascript
module.exports = {
  apps: [
    {
      name: 'ime365-api',
      script: './backend/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    },
    {
      name: 'ime365-export-worker',
      script: './backend/workers/exportWorker.js',
      instances: 2,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
```

---

## 4. NGINX REVERSE PROXY CONFIGURATION

```nginx
server {
    listen 80;
    server_name app.ime365.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.ime365.com;

    ssl_certificate /etc/letsencrypt/live/app.ime365.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.ime365.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self' https:; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;" always;

    # Static Frontend
    root /var/www/ime365/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Gateway Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

---

## 5. ZERO-DOWNTIME DEPLOYMENT RUNBOOK

### Execution Steps:
```bash
# 1. Pull verified production release commit
git checkout main
git pull origin main

# 2. Build production frontend assets
npm --prefix frontend ci --production=false
npm --prefix frontend run build

# 3. Install production backend dependencies
npm --prefix backend ci --production=true

# 4. Execute database migrations (Idempotent 001-037)
node backend/scripts/migrate.js

# 5. Reload PM2 cluster with zero downtime
pm2 reload ecosystem.config.cjs --update-env

# 6. Verify health probe
curl -f https://app.ime365.com/api/admin/health || pm2 revert
```
