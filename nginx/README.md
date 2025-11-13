# Nginx Configuration

This directory contains nginx reverse proxy configuration for Quote Calculator v3.0.

## Structure

```
nginx/
├── nginx.conf              # Main nginx configuration
├── conf.d/
│   ├── common-config.conf  # Shared location blocks and proxy settings
│   └── ssl.conf            # SSL/TLS configuration (cloud deployments)
├── ssl/                    # SSL certificates directory
│   ├── cert.pem            # SSL certificate (self-signed or Let's Encrypt)
│   └── key.pem             # Private key
├── .htpasswd.example       # Basic authentication template
└── README.md               # This file
```

## Files

### nginx.conf
Main nginx configuration with:
- Worker processes and connections
- Gzip compression
- Rate limiting zones
- Upstream backend configuration
- HTTP (port 80) and HTTPS (port 443) server blocks

### conf.d/common-config.conf
Shared configuration for both HTTP and HTTPS:
- Security headers (X-Frame-Options, CSP, etc.)
- Location blocks for API endpoints
- Proxy headers and timeouts
- Rate limiting per endpoint
- Error pages

### conf.d/ssl.conf
SSL-specific configuration:
- Let's Encrypt ACME challenge
- HTTPS redirect
- HSTS header
- Certificate paths

### ssl/
Directory for SSL certificates:
- **Self-signed (development):** Generated locally for testing
- **Let's Encrypt (production):** Obtained via certbot

### .htpasswd.example
Template for HTTP Basic Authentication:
- Example usernames and password hashes
- Instructions for generating secure passwords
- Not committed to git (use .htpasswd instead)

## Usage

### Development (HTTP only)
```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=localhost"

# Start with docker-compose
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Production (Let's Encrypt)
```bash
# Set domain
export DOMAIN=quotes.example.com
export EMAIL=admin@example.com

# Obtain certificate
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml \
  run --rm certbot-init

# Start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.cloud.yml up -d
```

### Basic Authentication (Optional)
```bash
# Generate password
htpasswd -c nginx/.htpasswd admin

# Uncomment auth lines in nginx/conf.d/common-config.conf
nano nginx/conf.d/common-config.conf

# Restart nginx
docker-compose restart nginx
```

## Configuration

### Rate Limiting

Defined in `nginx.conf`:

- **General API:** 10 req/s per IP (burst 20)
- **Export/Import:** 1 req/s per IP (burst 3)
- **Health Check:** 5 req/s per IP (burst 10)

### Security Headers

Defined in `conf.d/common-config.conf`:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: no-referrer-when-downgrade`
- `Content-Security-Policy: default-src 'self'; ...`
- `Strict-Transport-Security: max-age=31536000` (HTTPS only)

### Proxy Settings

- Timeouts: 60s (general), 120s (export/import)
- Body size limit: 50MB
- Buffering enabled
- HTTP/2 support

## Testing

### Test nginx configuration
```bash
# Syntax check
docker exec quote-nginx nginx -t

# Reload configuration
docker exec quote-nginx nginx -s reload

# View logs
docker exec quote-nginx tail -f /var/log/nginx/access.log
docker exec quote-nginx tail -f /var/log/nginx/error.log
```

### Test SSL
```bash
# Check certificate
openssl s_client -connect quotes.example.com:443 -servername quotes.example.com

# SSL Labs test
https://www.ssllabs.com/ssltest/analyze.html?d=quotes.example.com
```

### Test security headers
```bash
curl -I https://quotes.example.com/
```

## Troubleshooting

### 502 Bad Gateway
- Backend is down
- Check: `docker-compose ps quote-production`
- Restart: `docker-compose restart quote-production`

### SSL certificate errors
- Certificate not found
- Check: `docker exec quote-nginx ls -la /etc/letsencrypt/live/$DOMAIN/`
- Renew: `docker-compose exec certbot certbot renew`

### Rate limiting too strict
- Adjust rates in `nginx.conf`
- Change burst values in `conf.d/common-config.conf`

## Best Practices

1. **Always use HTTPS in production** (via Let's Encrypt)
2. **Enable basic auth for sensitive endpoints** (export/import)
3. **Monitor rate limiting** (check logs for 429 errors)
4. **Regular security updates** (rebuild nginx image monthly)
5. **Test SSL configuration** (aim for A+ on SSL Labs)
6. **Backup SSL certificates** (volume: certbot-etc)

## References

- [Nginx documentation](https://nginx.org/en/docs/)
- [Let's Encrypt documentation](https://letsencrypt.org/docs/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [Security Headers](https://securityheaders.com/)

---

**Version:** 3.0.0
**Last Updated:** October 28, 2025
