# Инструкции по настройке Docker окружения

## 🎯 Шаг за шагом

### 1️⃣ Локальное тестирование (5 минут)

```bash
# Перейти в директорию проекта
cd /Users/bogisis/Desktop/сметы/for_deploy

# Создать volumes
docker volume create quote-prod-catalog
docker volume create quote-prod-estimate
docker volume create quote-prod-backup
docker volume create quote-staging-catalog
docker volume create quote-staging-estimate
docker volume create quote-staging-backup

# Запустить контейнеры
npm run docker:up

# Подождать 10 секунд для инициализации
sleep 10

# Проверить health
npm run docker:health

# Должен вывести:
# ✅ Production: healthy
# ✅ Staging: healthy
# ✅ All systems operational
```

### 2️⃣ Проверка в браузере

Открыть:
- Production: http://localhost:3005
- Staging: http://localhost:3006

Обе должны показывать рабочий интерфейс Quote Calculator.

### 3️⃣ Проверка logs

```bash
# Все логи
npm run docker:logs

# Только production
docker logs quote-prod -f

# Только staging
docker logs quote-staging -f

# Нажать Ctrl+C для выхода
```

### 4️⃣ Тест остановки и перезапуска

```bash
# Остановить
npm run docker:down

# Проверить что volumes остались
docker volume ls | grep quote
# Должны быть все 6 volumes

# Запустить снова
npm run docker:up

# Проверить что данные сохранились
# (если создавали сметы - они должны остаться)
```

---

## 🚀 Настройка автодеплоя (GitHub Actions)

### Шаг 1: Получить Docker Hub Token

```bash
# 1. Зайти на hub.docker.com
# 2. Account Settings → Security → New Access Token
# 3. Название: "GitHub Actions"
# 4. Скопировать токен (показывается один раз!)
```

### Шаг 2: Настроить GitHub Secrets

```bash
# 1. Открыть репозиторий на GitHub
# 2. Settings → Secrets and variables → Actions
# 3. New repository secret

# Добавить следующие secrets:
```

**DOCKER_USERNAME**
```
your-dockerhub-username
```

**DOCKER_PASSWORD**
```
<токен из Шага 1>
```

**SERVER_HOST** (если есть production сервер)
```
123.456.789.0  # или your-server.com
```

**SERVER_USER**
```
deploy  # или ваш SSH пользователь
```

**SSH_PRIVATE_KEY**
```
-----BEGIN OPENSSH PRIVATE KEY-----
<ваш приватный SSH ключ>
-----END OPENSSH PRIVATE KEY-----
```

### Шаг 3: Настроить SSH на сервере (если есть production сервер)

```bash
# На локальной машине:
ssh-keygen -t ed25519 -C "github-actions-deploy"
# Сохранить в ~/.ssh/github_actions_deploy

# Скопировать публичный ключ на сервер:
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub deploy@your-server.com

# Скопировать ПРИВАТНЫЙ ключ в GitHub Secret SSH_PRIVATE_KEY:
cat ~/.ssh/github_actions_deploy
```

### Шаг 4: Подготовить сервер

```bash
# SSH на сервер
ssh deploy@your-server.com

# Установить Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Выйти и зайти снова (для применения группы)
exit
ssh deploy@your-server.com

# Создать директории
sudo mkdir -p /opt/quote-calculator
sudo chown $USER:$USER /opt/quote-calculator
sudo mkdir -p /tmp/backups/pre-deploy
sudo chown $USER:$USER /tmp/backups

# Клонировать репозиторий
cd /opt/quote-calculator
git clone <your-repo-url> .

# Создать volumes
docker volume create quote-prod-catalog
docker volume create quote-prod-estimate
docker volume create quote-prod-backup

# Сделать скрипты исполняемыми
chmod +x scripts/*.sh
```

### Шаг 5: Первый деплой на сервер

```bash
# На сервере:
cd /opt/quote-calculator

# Собрать и запустить
docker-compose up -d quote-production

# Проверить
./scripts/health-check.sh
```

### Шаг 6: Тест автодеплоя

```bash
# На локальной машине:

# Создать staging branch (если нет)
git checkout -b staging
git push origin staging

# Сделать тестовое изменение
echo "// test" >> server.js
git add server.js
git commit -m "test: CI/CD deployment"
git push origin staging

# Зайти на GitHub → Actions
# Должен запуститься workflow "Deploy to Docker"
# Ждать завершения (2-5 минут)

# Проверить на сервере
ssh deploy@your-server.com
curl http://localhost:3006/health
```

---

## 🔧 Watchtower Auto-Update (опционально)

### Включить автоматическое обновление

```bash
# На сервере:
cd /opt/quote-calculator

# Запустить с Watchtower
docker-compose -f docker-compose.yml \
               -f docker-compose.watchtower.yml up -d

# Проверить логи Watchtower
docker logs watchtower -f
```

**Workflow с Watchtower:**
1. Разработчик: `git push origin main`
2. GitHub Actions: билдит образ → пушит в Docker Hub
3. Watchtower (на сервере): каждые 5 минут проверяет Docker Hub
4. Watchtower: обнаруживает новый образ → автоматически обновляет контейнер
5. **Даунтайм: 0 секунд** (если настроить правильно)

---

## ✅ Checklist настройки

### Локально:
- [ ] Volumes созданы
- [ ] `npm run docker:up` работает
- [ ] `npm run docker:health` показывает healthy
- [ ] http://localhost:3005 открывается
- [ ] http://localhost:3006 открывается
- [ ] После `docker:down` и `docker:up` данные сохранились

### GitHub:
- [ ] Docker Hub токен получен
- [ ] GitHub Secrets настроены (DOCKER_USERNAME, DOCKER_PASSWORD)
- [ ] Push в staging → workflow запускается
- [ ] Workflow завершается успешно
- [ ] Образ появился в Docker Hub

### Production сервер (опционально):
- [ ] Docker установлен
- [ ] SSH доступ настроен
- [ ] Директории созданы
- [ ] Volumes созданы
- [ ] Первый деплой успешен
- [ ] Health check проходит
- [ ] Автодеплой работает (GitHub Actions или Watchtower)

---

## 🐛 Troubleshooting

### Ошибка: "port already in use"

```bash
# Найти процесс
sudo lsof -i :3005

# Убить процесс
sudo kill -9 <PID>

# Или остановить старые контейнеры
docker stop $(docker ps -q)
```

### Ошибка: "volume not found"

```bash
# Создать недостающие volumes
docker volume create quote-prod-catalog
docker volume create quote-prod-estimate
docker volume create quote-prod-backup
docker volume create quote-staging-catalog
docker volume create quote-staging-estimate
docker volume create quote-staging-backup
```

### Health check возвращает 503

```bash
# Проверить логи
docker logs quote-prod --tail 50

# Проверить volumes
docker volume inspect quote-prod-catalog

# Перезапустить
docker-compose restart quote-production
```

### GitHub Actions падает на SSH

```bash
# Проверить SSH ключ (должен быть БЕЗ passphrase)
ssh-keygen -t ed25519 -C "github-actions" -N ""

# Проверить формат в secret (должен быть с заголовками):
-----BEGIN OPENSSH PRIVATE KEY-----
<content>
-----END OPENSSH PRIVATE KEY-----
```

---

## 📚 Дополнительные ресурсы

- **Quick Start**: README_DOCKER.md
- **Полная документация**: docs/DOCKER_DEPLOYMENT.md
- **Summary**: DOCKER_IMPLEMENTATION_SUMMARY.md

---

**Готово!** Если всё работает локально - можно деплоить на production! 🚀
