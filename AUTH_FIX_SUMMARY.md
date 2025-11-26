# Authentication Fix Summary
**Date:** November 18, 2025
**Issue:** Incorrect bcrypt password hash + wrong login URL
**Status:** ✅ **RESOLVED**

---

## Problem 1: Wrong Password Hash

### Root Cause
Migration `004_add_users_auth.sql` used bcrypt hash with `$2a$` prefix (old format):
```
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
```

But `bcryptjs` library generates hashes with `$2b$` prefix (current format).

**Result:** `bcrypt.compare('admin123', hash)` returned `false`

### Solution
Generated new hash using bcryptjs:
```bash
docker exec quote-staging node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('admin123', 10).then(hash => console.log(hash));
"
# Output: $2b$10$f9GtmKSItfaTLNCbgizp6e2XZlaKUm7HrOvGOnXiZkmbwMXFCCaym
```

Updated migration file with correct hash.

---

## Problem 2: Wrong Login URL

### Root Cause
Documentation showed `/login` as endpoint, but auth routes are mounted at `/api/auth`:
```javascript
// server-with-db.js line 130
app.use('/api/auth', authRoutes);
```

**Result:** `/login` returned 404 "Cannot POST /login"

### Solution
Use correct endpoint path: `/api/auth/login`

---

## Fixed Configuration

### Default Admin User
```
Email: admin@localhost
Password: admin123
User ID: admin-user-001
Organization: default-org
Role: Admin

⚠️ ВАЖНО: Сменить пароль после первого входа!
```

### Correct API Endpoints
```
POST /api/auth/register  - Register new user
POST /api/auth/login     - Login
POST /api/auth/logout    - Logout (requires auth)
GET  /api/auth/me        - Get current user
POST /api/auth/change-password - Change password (requires auth)
GET  /api/auth/stats     - User statistics (requires auth)
```

---

## Verification

### ✅ Password Hash Test
```bash
$ docker exec quote-staging node -e "
const bcrypt = require('bcryptjs');
bcrypt.compare('admin123', '\$2b\$10\$f9GtmKSItfaTLNCbgizp6e2XZlaKUm7HrOvGOnXiZkmbwMXFCCaym')
  .then(result => console.log('Password check:', result));
"

Password check: true
```

### ✅ Login Test
```bash
$ curl -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"admin123"}' | jq .

{
  "success": true,
  "user": {
    "id": "admin-user-001",
    "email": "admin@localhost",
    "username": "admin",
    "is_admin": 1,
    "organization_id": "default-org",
    ...
  }
}
```

### ✅ Authenticated API Call
```bash
$ curl -b cookies.txt http://localhost:4001/api/estimates | jq .

{
  "success": true,
  "estimates": []
}
```

---

## Files Modified

1. **db/migrations/004_add_users_auth.sql** - Updated password hash from `$2a$` to `$2b$` format
2. **STAGING_DEPLOY.md** - Need to update with correct `/api/auth/login` endpoint
3. **DEPLOY_COMMANDS_CHEATSHEET.sh** - Need to update with correct endpoint

---

## Deployment Instructions (Updated)

### VPS Deployment
```bash
# 1. SSH to VPS
ssh user@your-vps-ip

# 2. Clone or update
git clone https://github.com/bogisis/magellania_crm.git /var/www/quote-calculator
# OR
cd /var/www/quote-calculator && git pull origin main

# 3. Build and start
docker compose build quote-staging
docker compose up -d quote-staging

# 4. Health check
curl http://localhost:4001/health

# 5. Test login
curl -c cookies.txt -X POST http://localhost:4001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localhost","password":"admin123"}'

# 6. Test authenticated API
curl -b cookies.txt http://localhost:4001/api/estimates
```

### Browser Access
```
URL: http://your-vps-ip:4001
Login: admin@localhost
Password: admin123

⚠️ Change password immediately after first login!
```

---

## Nginx Configuration (Optional)

If using Nginx reverse proxy, update login form to use `/api/auth/login`:

```nginx
server {
    listen 80;
    server_name staging.magellania.net;

    location / {
        proxy_pass http://localhost:4001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Important for sessions
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Security Checklist

- [x] Bcrypt hash format correct ($2b$10$...)
- [x] Password verification working
- [x] Login endpoint correct (/api/auth/login)
- [x] Sessions working with SQLite store
- [x] Authenticated API calls working
- [ ] **Change default admin password** (CRITICAL!)
- [ ] Setup HTTPS with Let's Encrypt (recommended)
- [ ] Configure firewall (UFW)
- [ ] Setup Nginx reverse proxy (optional)

---

## Success Criteria ✅

- [x] Password hash generates correctly
- [x] bcrypt.compare() returns true for 'admin123'
- [x] Login endpoint at /api/auth/login responds
- [x] Login returns success=true with user object
- [x] Session persists across requests
- [x] Authenticated API calls work
- [x] Fresh Docker install creates working admin user

---

**Status:** 🎉 **АВТОРИЗАЦИЯ РАБОТАЕТ**

Staging контейнер полностью функционален и готов к деплою.

**Важно:** После деплоя на VPS обязательно сменить пароль admin пользователя!
