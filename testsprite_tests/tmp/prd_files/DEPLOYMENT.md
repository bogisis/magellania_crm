# Quote Calculator v3.0 - Deployment Guide

**Version:** 3.0.0
**Date:** October 28, 2025
**Status:** Production Ready ✅

This guide covers deployment of Quote Calculator v3.0 for various environments: development, local production, and cloud/VPS with SSL.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Deployment Scenarios](#deployment-scenarios)
  - [Scenario 1: Development](#scenario-1-development)
  - [Scenario 2: Local Production (HTTP)](#scenario-2-local-production-http)
  - [Scenario 3: Cloud/VPS (HTTPS)](#scenario-3-cloudvps-https)
- [Configuration](#configuration)
- [Security](#security)
- [Monitoring](#monitoring)
- [Backup & Recovery](#backup--recovery)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Development (Fastest)
```bash
# 1. Clone and install
git clone <repository>
cd quote-calculator
npm install

# 2. Start development server
STORAGE_TYPE=sqlite node server-with-db.js

# 3. Open http://localhost:4000
```

### Production with Docker
```bash
# 1. Build and start
docker-compose up -d

# 2. Open http://localhost:4000
```

### Cloud/VPS with SSL
```bash
# 1. Set domain
export DOMAIN=quotes.example.com
export EMAIL=admin@example.com

# 2. Obtain SSL certificate
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml run --rm certbot-init

# 3. Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml up -d

# 4. Open https://quotes.example.com
```

---

## Prerequisites

### All Environments
- **Node.js:** v18+ (development only)
- **Docker:** v20+ (production)
- **Docker Compose:** v2+ (production)
- **Disk Space:** 2GB minimum
- **RAM:** 1GB minimum

### Cloud/VPS Additional Requirements
- **Domain name** pointing to your server IP
- **Firewall ports open:** 80, 443, 22
- **Static IP address** (recommended)
- **Root/sudo access**

### Software Versions
```bash
node --version    # v18.0.0 or higher
docker --version  # Docker version 20.0.0 or higher
docker-compose --version  # v2.0.0 or higher
```

---

## Deployment Scenarios

### Scenario 1: Development

**Use Case:** Local development, testing, debugging

**Architecture:**
```
Developer Machine
├── Node.js server (port 4000)
├── SQLite database (db/quotes.db)
└── Winston logs (logs/)
```

**Steps:**

1. **Install Dependencies**
```bash
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
nano .env
```

Set:
```env
NODE_ENV=development
STORAGE_TYPE=sqlite
LOG_LEVEL=debug
LOG_CONSOLE=true
```

3. **Start Server**
```bash
# Option A: Direct start
STORAGE_TYPE=sqlite node server-with-db.js

# Option B: With npm script
npm start
```

4. **Verify**
```bash
curl http://localhost:4000/api/health
```

**Development Features:**
- ✅ Hot reload (if using nodemon)
- ✅ Debug logging
- ✅ Console output
- ✅ No nginx overhead
- ✅ Direct access to files

**Limitations:**
- ❌ No reverse proxy
- ❌ No SSL/TLS
- ❌ No rate limiting
- ❌ Not production-ready

---

### Scenario 2: Local Production (HTTP)

**Use Case:** Local network, internal applications, testing production setup

**Architecture:**
```
Local Machine
├── nginx (port 80)
│   ├── Reverse proxy
│   ├── Rate limiting
│   ├── Gzip compression
│   └── Security headers
└── Docker Containers
    ├── quote-production (Node.js + SQLite)
    ├── quote-staging (optional)
    └── backup-service (optional)
```

**Steps:**

1. **Prepare Environment**
```bash
# Create SSL directory (for self-signed cert or future use)
mkdir -p nginx/ssl

# Generate self-signed certificate (optional, for testing HTTPS)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=localhost"
```

2. **Start Production Stack**
```bash
# Option A: Minimal (production only)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Option B: With staging
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d quote-production quote-staging nginx

# Option C: With backup service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml --profile backup up -d
```

3. **Verify Services**
```bash
# Check containers
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Check health
curl http://localhost/api/health

# Check nginx
curl -I http://localhost/
```

4. **View Logs**
```bash
# All services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f nginx
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f quote-production
```

**Production Features:**
- ✅ Nginx reverse proxy
- ✅ Rate limiting (10 req/s general, 1 req/s export/import)
- ✅ Gzip compression
- ✅ Security headers
- ✅ Resource limits
- ✅ Auto-restart
- ✅ Structured logging

**Limitations:**
- ❌ No SSL/TLS (HTTP only)
- ❌ Not internet-facing
- ⚠️ Suitable for internal networks only

---

### Scenario 3: Cloud/VPS (HTTPS)

**Use Case:** Production deployment, public internet access, secure HTTPS

**Architecture:**
```
Cloud VPS (e.g., DigitalOcean, AWS, GCP)
├── nginx (ports 80, 443)
│   ├── SSL/TLS termination (Let's Encrypt)
│   ├── HTTPS redirect
│   ├── HSTS header
│   └── All production features
├── Docker Containers
│   ├── quote-production
│   ├── certbot (auto-renewal)
│   └── backup-service
└── Volumes
    ├── quotes.db (persistent)
    ├── SSL certificates (persistent)
    └── logs (persistent)
```

**Prerequisites:**
- Domain name (e.g., quotes.example.com)
- DNS A record pointing to server IP
- Firewall ports open: 80, 443

**Steps:**

#### Step 1: Prepare Server

```bash
# 1. Connect to VPS
ssh root@your-server-ip

# 2. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 3. Install Docker Compose
apt-get update
apt-get install docker-compose-plugin

# 4. Verify installation
docker --version
docker compose version
```

#### Step 2: Deploy Application

```bash
# 1. Clone repository
git clone <repository>
cd quote-calculator

# 2. Set environment variables
export DOMAIN=quotes.example.com
export EMAIL=admin@example.com

# 3. Update .env file
cp .env.example .env
nano .env
```

Set:
```env
NODE_ENV=production
STORAGE_TYPE=sqlite
LOG_LEVEL=info
LOG_CONSOLE=false
PORT=4000
```

#### Step 3: Obtain SSL Certificate

```bash
# 1. Start nginx first (needed for ACME challenge)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx

# 2. Wait for nginx to start
sleep 10

# 3. Obtain certificate
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml \
  run --rm certbot-init

# 4. Verify certificate
docker exec quote-nginx ls -la /etc/letsencrypt/live/$DOMAIN/
```

#### Step 4: Start Full Stack

```bash
# 1. Stop nginx
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# 2. Update nginx config to use SSL (uncomment HTTPS redirect in nginx.conf)
nano nginx/nginx.conf
# Uncomment line: return 301 https://$server_name$request_uri;

# 3. Start full stack with SSL
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml up -d

# 4. Verify HTTPS
curl https://$DOMAIN/api/health
```

#### Step 5: Configure Auto-Renewal

Certbot service automatically renews certificates every 12 hours. Verify:

```bash
# Check certbot service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml ps certbot

# View certbot logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml logs -f certbot

# Manual renewal test
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml \
  exec certbot certbot renew --dry-run
```

**Cloud Features:**
- ✅ All production features
- ✅ SSL/TLS with Let's Encrypt
- ✅ Automatic certificate renewal
- ✅ HTTPS redirect
- ✅ HSTS header
- ✅ A+ SSL Labs rating
- ✅ Internet-facing ready

---

## Configuration

### Environment Variables

All configuration is via `.env` file:

```env
# Server
PORT=4000
NODE_ENV=production

# Storage
STORAGE_TYPE=sqlite
DB_PATH=db/quotes.db

# Logging
LOG_LEVEL=info
LOG_CONSOLE=false

# Performance
JSON_LIMIT=50mb
REQUEST_TIMEOUT=30000

# Cloud-specific
DOMAIN=quotes.example.com
EMAIL=admin@example.com
```

### Nginx Configuration

**Main config:** `nginx/nginx.conf`
- Worker processes
- Gzip compression
- Rate limiting zones
- Upstream backend

**Common config:** `nginx/conf.d/common-config.conf`
- Location blocks
- Security headers
- Proxy settings
- Rate limits

**SSL config:** `nginx/conf.d/ssl.conf` (cloud only)
- ACME challenge
- HTTPS redirect
- HSTS header

### Basic Authentication (Optional)

Protect API endpoints with HTTP Basic Auth:

1. **Generate password hash**
```bash
# Install htpasswd
apt-get install apache2-utils

# Create .htpasswd file
htpasswd -c nginx/.htpasswd admin
# Enter password when prompted
```

2. **Enable in nginx config**
```nginx
# Uncomment in nginx/conf.d/common-config.conf
location /api/ {
    auth_basic "Restricted Access";
    auth_basic_user_file /etc/nginx/.htpasswd;
    # ... rest of config
}
```

3. **Restart nginx**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
```

---

## Security

### Security Checklist

#### Required
- [x] HTTPS enabled (cloud deployments)
- [x] Security headers configured
- [x] Rate limiting enabled
- [x] File upload size limits
- [x] Regular backups
- [x] Strong passwords (if using basic auth)
- [x] Firewall configured

#### Recommended
- [ ] Basic auth enabled for admin endpoints
- [ ] SSH key-only access (disable password)
- [ ] Fail2ban installed
- [ ] Regular security updates
- [ ] Log monitoring
- [ ] Intrusion detection (e.g., OSSEC)

### Security Headers

Automatically configured in `nginx/conf.d/common-config.conf`:

```nginx
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: no-referrer-when-downgrade
Content-Security-Policy: default-src 'self'; ...
Strict-Transport-Security: max-age=31536000; includeSubDomains  # HTTPS only
```

### Rate Limiting

Configured in `nginx/nginx.conf`:

- **General API:** 10 requests/second per IP
- **Export/Import:** 1 request/second per IP
- **Health checks:** 5 requests/second per IP

### Firewall Rules (Cloud/VPS)

```bash
# UFW (Ubuntu)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable

# Verify
ufw status
```

---

## Monitoring

### Health Checks

**Application health:**
```bash
curl http://localhost/api/health | jq
```

Response:
```json
{
  "status": "healthy",
  "version": "3.0.0",
  "storage": {
    "type": "sqlite",
    "health": { "healthy": true },
    "stats": {
      "estimatesCount": 10,
      "backupsCount": 15,
      "storageSize": 663552
    }
  },
  "uptime": 3600.5
}
```

**Docker health:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

### Logs

**View logs:**
```bash
# All services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f quote-production

# Last 100 lines
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 quote-production
```

**Winston logs location:**
```
logs/combined.log  # All logs
logs/error.log     # Errors only
```

**Nginx logs:**
```bash
docker exec quote-nginx tail -f /var/log/nginx/access.log
docker exec quote-nginx tail -f /var/log/nginx/error.log
```

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df

# Volume usage
docker volume ls
du -sh $(docker volume inspect quote-prod-db --format '{{.Mountpoint}}')
```

---

## Backup & Recovery

### Automated Backup

Use `backup-service` from `docker-compose.yml`:

```bash
# Start with backup service
docker-compose --profile backup up -d

# Backups stored in ./backups/
ls -lh backups/
```

**Configuration:**
- **Frequency:** Every hour (via cron)
- **Retention:** 30 days
- **Format:** `.tar.gz`
- **Location:** `./backups/` on host

### Manual Backup

#### Option 1: Export via API
```bash
# Export all data as JSON
curl http://localhost/api/export/all > backup-$(date +%Y%m%d).json

# Export database binary
curl http://localhost/api/export/database > backup-$(date +%Y%m%d).db
```

#### Option 2: Docker Volume Backup
```bash
# Backup database volume
docker run --rm \
  -v quote-prod-db:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz -C /data .

# Backup logs
docker run --rm \
  -v quote-prod-logs:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/logs-backup-$(date +%Y%m%d).tar.gz -C /data .
```

#### Option 3: Database File Copy
```bash
# Copy database file directly
docker cp quote-prod:/usr/src/app/db/quotes.db ./backups/quotes-$(date +%Y%m%d).db
```

### Recovery

#### From JSON Export
```bash
# Import via API
curl -X POST http://localhost/api/import/all \
  -H "Content-Type: application/json" \
  -d @backup-20251028.json
```

#### From Database File
```bash
# Stop services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

# Restore database
docker run --rm \
  -v quote-prod-db:/data \
  -v $(pwd)/backups:/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/db-backup-20251028.tar.gz -C /data"

# Restart services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Error: port 4000 already in use

# Find process
lsof -ti:4000

# Kill process
kill $(lsof -ti:4000)

# Or change port in .env
PORT=4001
```

#### 2. SSL Certificate Failed
```bash
# Error: certbot failed to obtain certificate

# Check DNS
dig quotes.example.com +short
# Should return your server IP

# Check firewall
curl -I http://quotes.example.com/.well-known/acme-challenge/test

# Manual certificate request with verbose
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml \
  run --rm certbot-init --verbose
```

#### 3. Database Locked
```bash
# Error: database is locked

# Check if multiple processes accessing database
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Restart services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart
```

#### 4. High Memory Usage
```bash
# Check stats
docker stats

# Adjust resource limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 256M  # Reduce if needed
```

#### 5. Nginx 502 Bad Gateway
```bash
# Backend is down

# Check backend health
docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps quote-production

# Check logs
docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs quote-production

# Restart backend
docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart quote-production
```

### Debug Mode

Enable debug logging:

```bash
# Update .env
LOG_LEVEL=debug
LOG_CONSOLE=true

# Restart
docker-compose -f docker-compose.yml -f docker-compose.prod.yml restart quote-production
```

### Support

For issues:
1. Check logs: `docker-compose logs -f`
2. Check health: `curl http://localhost/api/health`
3. Review documentation: `API_EXPORT_IMPORT.md`, `DOCKER.md`
4. Create GitHub issue with logs

---

## Maintenance

### Regular Tasks

**Daily:**
- [ ] Monitor disk space
- [ ] Check application health
- [ ] Review error logs

**Weekly:**
- [ ] Test backups
- [ ] Review access logs
- [ ] Update dependencies (dev environment)

**Monthly:**
- [ ] Security updates
- [ ] Certificate expiry check (auto-renewed, but verify)
- [ ] Performance review
- [ ] Backup cleanup (old backups)

### Updates

```bash
# 1. Backup current state
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec quote-production \
  node -e "require('child_process').execSync('curl http://localhost:4000/api/export/all > /tmp/backup.json')"

# 2. Pull latest code
git pull

# 3. Rebuild images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# 4. Restart services (zero-downtime with staging)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps --build quote-staging
# Test staging, then:
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps --build quote-production

# 5. Verify
curl http://localhost/api/health
```

---

## Architecture Diagrams

### Development
```
Developer → :4000 → Node.js → SQLite
                    └─> logs/
```

### Local Production
```
Client → :80 → Nginx → :4000 → Docker[Node.js] → SQLite
                │                    └─> logs/
                └─> rate limiting
                └─> compression
                └─> security headers
```

### Cloud/VPS
```
Internet → :443 → Nginx[SSL] → :4000 → Docker[Node.js] → SQLite
            │          │                      └─> logs/
            │          └─> Let's Encrypt ← certbot (auto-renew)
            └─> :80 → redirect to HTTPS
```

---

## Performance Tuning

### Nginx
```nginx
# Increase worker connections
worker_connections 2048;

# Increase buffer sizes
client_body_buffer_size 128k;
client_header_buffer_size 1k;
```

### Node.js
```bash
# Increase memory
NODE_OPTIONS="--max-old-space-size=512"
```

### Docker
```yaml
# In docker-compose.yml
deploy:
  resources:
    limits:
      cpus: '2.0'      # Increase
      memory: 1024M    # Increase
```

---

## License

Quote Calculator v3.0 - Internal Use

---

**Version:** 3.0.0
**Last Updated:** October 28, 2025
**Deployment Status:** ✅ Production Ready
