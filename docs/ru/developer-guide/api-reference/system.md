# Quote Calculator v3.0 - System API

**Статус:** ✅ Production Ready
**Версия:** 2.3.0
**Дата:** 6 ноября 2025

## Обзор

System API предоставляет endpoints для мониторинга состояния сервиса, проверки здоровья системы и получения статистики использования.

### Ключевые особенности

- **Health Check** - проверка работоспособности всех компонентов
- **Storage Stats** - статистика по количеству данных
- **Disk Space Monitoring** - мониторинг свободного места
- **Uptime Tracking** - время работы сервера
- **Production Safety** - автоматические проверки перед операциями

## Endpoints

### 1. Health Check

Проверка работоспособности сервиса и всех его компонентов.

**Endpoint:** `GET /health`

**Response (Healthy):**
```json
{
  "status": "healthy",
  "version": "2.3.0",
  "environment": "production",
  "storage": {
    "type": "sqlite",
    "health": {
      "healthy": true,
      "readable": true,
      "writable": true
    },
    "stats": {
      "estimatesCount": 125,
      "backupsCount": 487,
      "catalogsCount": 3
    }
  },
  "diskSpace": {
    "healthy": true,
    "available": 52428800000,
    "total": 107374182400,
    "percentUsed": 51.2,
    "threshold": 10
  },
  "uptime": 3456.789,
  "timestamp": "2025-11-06T07:00:00.000Z"
}
```

**Response (Unhealthy):**
```json
{
  "status": "unhealthy",
  "version": "2.3.0",
  "environment": "production",
  "storage": {
    "type": "sqlite",
    "health": {
      "healthy": false,
      "readable": true,
      "writable": false,
      "error": "Database is locked"
    },
    "stats": {
      "estimatesCount": 125,
      "backupsCount": 487,
      "catalogsCount": 3
    }
  },
  "diskSpace": {
    "healthy": false,
    "available": 536870912,
    "total": 107374182400,
    "percentUsed": 99.5,
    "threshold": 10
  },
  "uptime": 3456.789,
  "timestamp": "2025-11-06T07:00:00.000Z"
}
```

**HTTP Status Codes:**
- `200` - Service is healthy
- `503` - Service is unhealthy (storage or disk space issues)

**Fields Description:**

**Root Level:**
- `status` - "healthy" или "unhealthy"
- `version` - версия приложения
- `environment` - окружение (development, production)
- `uptime` - время работы сервера в секундах
- `timestamp` - текущее время сервера (ISO 8601)

**Storage:**
- `type` - тип хранилища ("sqlite" или "file")
- `health.healthy` - общее состояние storage
- `health.readable` - доступность для чтения
- `health.writable` - доступность для записи
- `health.error` - описание ошибки (если есть)
- `stats.estimatesCount` - количество смет
- `stats.backupsCount` - количество backups
- `stats.catalogsCount` - количество каталогов

**Disk Space:**
- `healthy` - достаточно ли места (> threshold%)
- `available` - доступное место в байтах
- `total` - общий размер диска в байтах
- `percentUsed` - процент использованного места
- `threshold` - порог предупреждения (по умолчанию 10%)

**Example:**
```bash
# Простая проверка
curl http://localhost:4000/health

# Проверка только status
curl -s http://localhost:4000/health | jq -r '.status'
# "healthy"

# Проверка с exit code (для скриптов)
curl -sf http://localhost:4000/health > /dev/null && echo "OK" || echo "FAIL"

# Мониторинг каждую минуту
watch -n 60 'curl -s http://localhost:4000/health | jq'

# Извлечь статистику
curl -s http://localhost:4000/health | jq '.storage.stats'
```

**Use Cases:**
- Kubernetes/Docker health probes
- Мониторинг системы (Prometheus, Grafana)
- Автоматические алерты при проблемах
- Pre-deployment checks
- Load balancer health checks

---

### 2. Detailed Stats (через /health)

Получить детальную статистику использования (включена в health check).

**Доступ:** Через `GET /health` в поле `storage.stats`

**Example Response:**
```json
{
  "storage": {
    "stats": {
      "estimatesCount": 125,
      "backupsCount": 487,
      "catalogsCount": 3,
      "avgBackupsPerEstimate": 3.9,
      "totalDataSize": "45.2 MB",
      "oldestEstimate": "2024-11-01T10:00:00.000Z",
      "newestEstimate": "2025-11-06T06:55:00.000Z"
    }
  }
}
```

**Example:**
```bash
# Получить только статистику
curl -s http://localhost:4000/health | jq '.storage.stats'

# Количество смет
curl -s http://localhost:4000/health | jq '.storage.stats.estimatesCount'

# Среднее количество backups на смету
curl -s http://localhost:4000/health | jq '.storage.stats.avgBackupsPerEstimate'

# Проверить рост данных
BEFORE=$(curl -s http://localhost:4000/health | jq '.storage.stats.estimatesCount')
sleep 3600  # 1 час
AFTER=$(curl -s http://localhost:4000/health | jq '.storage.stats.estimatesCount')
echo "New estimates: $((AFTER - BEFORE))"
```

---

## Health Check Implementation

### Storage Health Check

```javascript
// storage/SQLiteStorage.js
async healthCheck() {
  try {
    // Test read
    const testRead = this.db.prepare('SELECT 1').get();
    if (!testRead) {
      throw new Error('Read test failed');
    }

    // Test write (в memory или temp table)
    const testWrite = this.db.prepare(
      'CREATE TEMP TABLE IF NOT EXISTS health_check (id INTEGER)'
    ).run();

    return {
      healthy: true,
      readable: true,
      writable: true
    };
  } catch (err) {
    return {
      healthy: false,
      readable: true,  // Might still be readable
      writable: false,
      error: err.message
    };
  }
}
```

### Disk Space Check

```javascript
// middleware/diskSpace.js
function getDiskSpaceInfo() {
  const stats = fs.statfsSync(process.cwd());

  const available = stats.bavail * stats.bsize;
  const total = stats.blocks * stats.bsize;
  const used = total - available;
  const percentUsed = (used / total) * 100;

  const THRESHOLD_PERCENT = 10; // Warn if <10% free

  return {
    healthy: percentUsed < (100 - THRESHOLD_PERCENT),
    available,
    total,
    percentUsed: Math.round(percentUsed * 10) / 10,
    threshold: THRESHOLD_PERCENT
  };
}
```

---

## Monitoring Patterns

### 1. Docker Health Check

```dockerfile
# Dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1
```

**docker-compose.yml:**
```yaml
services:
  quote-calculator:
    image: quote-calculator:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
```

### 2. Kubernetes Probes

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: quote-calculator
spec:
  containers:
  - name: app
    image: quote-calculator:latest
    ports:
    - containerPort: 4000

    # Liveness Probe - перезапуск если unhealthy
    livenessProbe:
      httpGet:
        path: /health
        port: 4000
      initialDelaySeconds: 10
      periodSeconds: 30
      timeoutSeconds: 5
      failureThreshold: 3

    # Readiness Probe - не направлять трафик если unhealthy
    readinessProbe:
      httpGet:
        path: /health
        port: 4000
      initialDelaySeconds: 5
      periodSeconds: 10
      timeoutSeconds: 3
      failureThreshold: 2

    # Startup Probe - для медленного старта
    startupProbe:
      httpGet:
        path: /health
        port: 4000
      initialDelaySeconds: 0
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 30  # 30 * 5s = 150s max startup time
```

### 3. Prometheus Metrics

```javascript
// Expose metrics для Prometheus
const promClient = require('prom-client');

const healthGauge = new promClient.Gauge({
  name: 'quote_calculator_health',
  help: 'Health status (1=healthy, 0=unhealthy)'
});

const estimatesGauge = new promClient.Gauge({
  name: 'quote_calculator_estimates_total',
  help: 'Total number of estimates'
});

const backupsGauge = new promClient.Gauge({
  name: 'quote_calculator_backups_total',
  help: 'Total number of backups'
});

const diskSpaceGauge = new promClient.Gauge({
  name: 'quote_calculator_disk_space_percent_used',
  help: 'Disk space usage percentage'
});

// Update metrics при каждом health check
app.get('/health', async (req, res) => {
  const health = await getHealthStatus();

  healthGauge.set(health.status === 'healthy' ? 1 : 0);
  estimatesGauge.set(health.storage.stats.estimatesCount);
  backupsGauge.set(health.storage.stats.backupsCount);
  diskSpaceGauge.set(health.diskSpace.percentUsed);

  res.json(health);
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});
```

### 4. Alerting Script

```bash
#!/bin/bash
# alert.sh - Monitoring script

HEALTH_URL="http://localhost:4000/health"
ALERT_EMAIL="admin@example.com"

while true; do
  RESPONSE=$(curl -s $HEALTH_URL)
  STATUS=$(echo $RESPONSE | jq -r '.status')

  if [ "$STATUS" != "healthy" ]; then
    # Извлечь детали проблемы
    STORAGE_ERROR=$(echo $RESPONSE | jq -r '.storage.health.error // "N/A"')
    DISK_PERCENT=$(echo $RESPONSE | jq -r '.diskSpace.percentUsed')

    # Отправить алерт
    echo "ALERT: Quote Calculator unhealthy

Status: $STATUS
Storage Error: $STORAGE_ERROR
Disk Usage: $DISK_PERCENT%

Full Response:
$RESPONSE
" | mail -s "Quote Calculator Health Alert" $ALERT_EMAIL

    # Логировать
    echo "[$(date)] UNHEALTHY: $RESPONSE" >> /var/log/quote-calculator-health.log
  else
    echo "[$(date)] OK" >> /var/log/quote-calculator-health.log
  fi

  sleep 300  # Check every 5 minutes
done
```

### 5. Uptime Robot / Status Page

```javascript
// Простой status page
app.get('/status', async (req, res) => {
  const health = await getHealthStatus();

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Quote Calculator Status</title>
      <meta http-equiv="refresh" content="30">
      <style>
        body { font-family: Arial; padding: 50px; }
        .status { font-size: 48px; margin: 20px 0; }
        .healthy { color: green; }
        .unhealthy { color: red; }
        .metric { margin: 10px 0; }
      </style>
    </head>
    <body>
      <h1>Quote Calculator Status</h1>
      <div class="status ${health.status}">
        ${health.status === 'healthy' ? '✓ Healthy' : '✗ Unhealthy'}
      </div>

      <h2>Metrics</h2>
      <div class="metric">Estimates: ${health.storage.stats.estimatesCount}</div>
      <div class="metric">Backups: ${health.storage.stats.backupsCount}</div>
      <div class="metric">Disk Usage: ${health.diskSpace.percentUsed}%</div>
      <div class="metric">Uptime: ${Math.floor(health.uptime / 3600)}h</div>

      <p><small>Auto-refreshes every 30 seconds</small></p>
    </body>
    </html>
  `);
});
```

---

## Common Use Cases

### 1. Pre-deployment Health Check

```bash
#!/bin/bash
# deploy.sh

echo "Checking current service health..."
HEALTH=$(curl -sf http://production:4000/health)

if [ $? -ne 0 ]; then
  echo "ERROR: Service is unhealthy, aborting deployment"
  exit 1
fi

STATUS=$(echo $HEALTH | jq -r '.status')
if [ "$STATUS" != "healthy" ]; then
  echo "ERROR: Service reports unhealthy status"
  echo $HEALTH | jq
  exit 1
fi

echo "Service is healthy, proceeding with deployment..."
# ... deployment steps ...
```

### 2. Load Balancer Integration

```nginx
# nginx.conf
upstream quote_calculator {
  server app1:4000;
  server app2:4000;
  server app3:4000;

  # Health check (nginx plus)
  health_check interval=10s fails=3 passes=2 uri=/health match=healthy_check;
}

match healthy_check {
  status 200;
  header Content-Type = application/json;
  body ~ "\"status\":\"healthy\"";
}

server {
  listen 80;
  location / {
    proxy_pass http://quote_calculator;
  }
}
```

### 3. Automatic Restart on Unhealthy

```bash
#!/bin/bash
# watchdog.sh

while true; do
  STATUS=$(curl -sf http://localhost:4000/health | jq -r '.status')

  if [ "$STATUS" != "healthy" ]; then
    echo "[$(date)] Service unhealthy, restarting..."

    # Restart service
    systemctl restart quote-calculator

    # Wait for startup
    sleep 10

    # Verify restart
    NEW_STATUS=$(curl -sf http://localhost:4000/health | jq -r '.status')
    if [ "$NEW_STATUS" == "healthy" ]; then
      echo "[$(date)] Service restarted successfully"
    else
      echo "[$(date)] Restart failed, alerting admin"
      # Send alert
    fi
  fi

  sleep 60
done
```

### 4. Dashboard Integration

```javascript
// React Component
function HealthDashboard() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    const fetchHealth = async () => {
      const response = await fetch('/health');
      const data = await response.json();
      setHealth(data);
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 30000); // Every 30s

    return () => clearInterval(interval);
  }, []);

  if (!health) return <div>Loading...</div>;

  return (
    <div className="health-dashboard">
      <h2>System Health</h2>

      <div className={`status ${health.status}`}>
        {health.status === 'healthy' ? '✓ Healthy' : '✗ Unhealthy'}
      </div>

      <div className="metrics">
        <div>Version: {health.version}</div>
        <div>Environment: {health.environment}</div>
        <div>Uptime: {Math.floor(health.uptime / 3600)}h</div>
      </div>

      <div className="storage">
        <h3>Storage</h3>
        <div>Type: {health.storage.type}</div>
        <div>Estimates: {health.storage.stats.estimatesCount}</div>
        <div>Backups: {health.storage.stats.backupsCount}</div>
        <div>Catalogs: {health.storage.stats.catalogsCount}</div>
      </div>

      <div className="disk">
        <h3>Disk Space</h3>
        <div>Used: {health.diskSpace.percentUsed}%</div>
        <div>Available: {(health.diskSpace.available / 1e9).toFixed(1)} GB</div>
        <div className={health.diskSpace.healthy ? 'ok' : 'warning'}>
          {health.diskSpace.healthy ? 'OK' : 'Low disk space!'}
        </div>
      </div>
    </div>
  );
}
```

### 5. Cron Job для Daily Report

```bash
#!/bin/bash
# daily-report.sh

HEALTH=$(curl -s http://localhost:4000/health)
DATE=$(date +%Y-%m-%d)

# Extract metrics
ESTIMATES=$(echo $HEALTH | jq '.storage.stats.estimatesCount')
BACKUPS=$(echo $HEALTH | jq '.storage.stats.backupsCount')
DISK_USED=$(echo $HEALTH | jq '.diskSpace.percentUsed')
UPTIME_HOURS=$(echo $HEALTH | jq '.uptime' | awk '{print int($1/3600)}')

# Generate report
cat > /var/reports/quote-calculator-$DATE.txt <<EOF
Quote Calculator Daily Report - $DATE
=====================================

Status: $(echo $HEALTH | jq -r '.status')
Version: $(echo $HEALTH | jq -r '.version')
Uptime: ${UPTIME_HOURS}h

Storage Statistics:
- Estimates: $ESTIMATES
- Backups: $BACKUPS
- Catalogs: $(echo $HEALTH | jq '.storage.stats.catalogsCount')

Disk Space:
- Used: ${DISK_USED}%
- Available: $(echo $HEALTH | jq '.diskSpace.available' | numfmt --to=iec)

Health Status: $(echo $HEALTH | jq '.storage.health')
EOF

# Email report
cat /var/reports/quote-calculator-$DATE.txt | \
  mail -s "Quote Calculator Daily Report $DATE" admin@example.com
```

---

## Error Handling

### Common Issues

**1. Service Unavailable**
```bash
$ curl http://localhost:4000/health
curl: (7) Failed to connect to localhost port 4000: Connection refused
```
**Причина:** Сервер не запущен
**Решение:**
```bash
# Проверить процесс
ps aux | grep node

# Запустить сервер
node server-with-db.js &

# Проверить логи
tail -f logs/combined.log
```

**2. Unhealthy Storage**
```json
{
  "status": "unhealthy",
  "storage": {
    "health": {
      "healthy": false,
      "error": "Database is locked"
    }
  }
}
```
**Причина:** SQLite database locked
**Решение:**
```bash
# Проверить процессы использующие БД
lsof db/quotes.db

# Если нужно, убить процесс
kill -9 <PID>

# Restart service
systemctl restart quote-calculator
```

**3. Low Disk Space**
```json
{
  "status": "unhealthy",
  "diskSpace": {
    "healthy": false,
    "percentUsed": 95.8
  }
}
```
**Причина:** Недостаточно свободного места
**Решение:**
```bash
# Проверить место
df -h

# Cleanup старых backups
sqlite3 db/quotes.db "DELETE FROM backups WHERE created_at < datetime('now', '-90 days')"

# Cleanup логов
find logs/ -name "*.log" -mtime +30 -delete

# Vacuum SQLite
sqlite3 db/quotes.db "VACUUM"
```

**4. Slow Response**
```bash
$ time curl http://localhost:4000/health
# Takes >5 seconds
```
**Причина:** Database performance issues
**Решение:**
```sql
-- Analyze tables
ANALYZE estimates;
ANALYZE backups;
ANALYZE catalogs;

-- Rebuild indexes
REINDEX idx_estimates_updated;
REINDEX idx_backups_estimate;

-- Check query plan
EXPLAIN QUERY PLAN SELECT COUNT(*) FROM estimates;
```

---

## Performance

### Response Times (Average)

| Condition | Response Time | Notes |
|-----------|---------------|-------|
| Healthy (SQLite) | <10ms | Fast health check |
| Healthy (1000 estimates) | <20ms | With stats calculation |
| Unhealthy (locked DB) | <5ms | Quick fail |
| Cold start | <50ms | First request after startup |

### Optimization Tips

**1. Cache Health Status**
```javascript
let cachedHealth = null;
let cacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

app.get('/health', async (req, res) => {
  const now = Date.now();

  if (cachedHealth && (now - cacheTime) < CACHE_TTL) {
    return res.json(cachedHealth);
  }

  const health = await getHealthStatus();
  cachedHealth = health;
  cacheTime = now;

  res.json(health);
});
```

**2. Lightweight Health Check**
```javascript
// /health/light - быстрая проверка без stats
app.get('/health/light', async (req, res) => {
  try {
    // Только проверка connectivity
    await storage.db.prepare('SELECT 1').get();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});
```

---

## Testing

### Manual Testing

```bash
# 1. Проверить healthy status
curl http://localhost:4000/health | jq '.status'
# "healthy"

# 2. Проверить статистику
curl http://localhost:4000/health | jq '.storage.stats'

# 3. Проверить disk space
curl http://localhost:4000/health | jq '.diskSpace'

# 4. Тест с таймаутом
timeout 3 curl http://localhost:4000/health || echo "Timeout!"

# 5. Мониторинг в реальном времени
watch -n 5 'curl -s http://localhost:4000/health | jq "{status, uptime, disk: .diskSpace.percentUsed}"'
```

### Automated Testing

```bash
# Run health check tests
npm test -- __tests__/health.test.js

# Test specific scenario
npm test -- __tests__/health.test.js -t "returns 503 when unhealthy"
```

---

## Security Considerations

### 1. Information Disclosure

```javascript
// Production: Скрыть детали ошибок
if (process.env.NODE_ENV === 'production') {
  return res.status(503).json({
    status: 'unhealthy'
    // НЕ включать .error с деталями
  });
}
```

### 2. Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60 // max 60 requests per minute
});

app.get('/health', healthLimiter, async (req, res) => {
  // ...
});
```

### 3. Authentication for Internal Endpoints

```javascript
// /metrics только для внутренних систем
app.get('/metrics', requireInternalIP, (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});

function requireInternalIP(req, res, next) {
  const ip = req.ip;
  const allowedIPs = ['127.0.0.1', '10.0.0.0/8', '172.16.0.0/12'];

  if (isAllowed(ip, allowedIPs)) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
}
```

---

## Related Documentation

- [API Reference Index](index.md) - Обзор всех API endpoints
- [Deployment: Docker](../deployment/docker.md) - Docker health checks
- [Deployment: Production](../deployment/production.md) - Production monitoring
- [Troubleshooting](../troubleshooting/common-errors.md) - Решение проблем

---

[← Назад к API Reference](index.md)

**Версия:** 3.0.0
**Последнее обновление:** 6 ноября 2025
