# 🔧 Исправление CSP блокировки Lucide Icons

**Проблема:** Content Security Policy блокирует загрузку lucide icons с unpkg.com

**Ошибка:**
```
Loading the script 'https://unpkg.com/lucide@latest' violates the following
Content Security Policy directive: "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

**Результат:** `ReferenceError: lucide is not defined`

---

## ✅ Решение применено

Обновлен файл `nginx/conf.d/common-config.conf`:
- Добавлен `https://unpkg.com` в `script-src`
- Добавлен `https://cdn.quilljs.com` в `style-src` (на будущее)

---

## 🚀 Применение на сервере

### Вариант 1: Обновление через git (рекомендуется)

```bash
# На сервере
ssh root@YOUR_SERVER_IP

cd /opt/quote-calculator

# Backup текущего nginx конфига
docker-compose -f docker-compose.vps.yml exec nginx \
  cat /etc/nginx/conf.d/common-config.conf > /tmp/nginx-backup.conf

# Остановить контейнеры
docker-compose -f docker-compose.vps.yml down

# Обновить код
git fetch origin
git pull origin db_initial_schema_refactoring

# Перезапустить
docker-compose -f docker-compose.vps.yml up -d --build

# Проверить nginx конфигурацию
docker-compose -f docker-compose.vps.yml exec nginx nginx -t

# Если OK - перезапустить nginx
docker-compose -f docker-compose.vps.yml restart nginx
```

### Вариант 2: Ручное редактирование (быстро)

```bash
# На сервере
ssh root@YOUR_SERVER_IP

cd /opt/quote-calculator

# Редактировать файл
nano nginx/conf.d/common-config.conf

# Найти строку (около 22):
# add_header Content-Security-Policy "default-src 'self'; script-src 'self' ...

# Заменить на:
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://cdn.quilljs.com; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';" always;

# Сохранить (Ctrl+O, Enter, Ctrl+X)

# Проверить конфигурацию
docker-compose -f docker-compose.vps.yml exec nginx nginx -t

# Перезапустить nginx
docker-compose -f docker-compose.vps.yml restart nginx
```

### Вариант 3: Только nginx без полной пересборки

```bash
# На сервере
cd /opt/quote-calculator

# Обновить код
git pull origin db_initial_schema_refactoring

# Пересобрать только nginx
docker-compose -f docker-compose.vps.yml up -d --force-recreate --no-deps nginx

# Проверить
docker-compose -f docker-compose.vps.yml logs -f nginx
```

---

## 🔍 Проверка исправления

### 1. Проверить CSP заголовок

```bash
# С сервера
curl -I https://crm.magellania.net

# Должен содержать:
# Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; ...
```

### 2. Проверить в браузере

1. Открыть https://crm.magellania.net
2. Открыть Developer Tools (F12)
3. Перейти на вкладку Console
4. Обновить страницу (Ctrl+R)
5. Проверить:
   - ✅ Нет ошибок CSP
   - ✅ Нет `ReferenceError: lucide is not defined`
   - ✅ Иконки отображаются корректно

### 3. Проверить логи nginx

```bash
docker-compose -f docker-compose.vps.yml logs nginx | grep -i "CSP\|lucide"
```

---

## 🛡️ Безопасность

**Добавленные домены в whitelist:**
- `https://unpkg.com` - CDN для lucide icons
- `https://cdn.quilljs.com` - CDN для Quill.js (пока не используется)

**Риски:**
- ⚠️ Зависимость от внешних CDN
- ⚠️ Возможность MITM атак на CDN

**Митигация:**
- ✅ Используются HTTPS CDN
- ✅ Только конкретные домены (не wildcard)
- 🔄 Рекомендуется: локальное хранение библиотек (см. ниже)

---

## 📦 Альтернатива: Локальное хранение Lucide (рекомендуется)

### Шаг 1: Скачать lucide локально

```bash
# На локальной машине
cd /Users/bogisis/Desktop/сметы/for_deploy\ copy/

# Создать директорию для vendor библиотек
mkdir -p public/vendor

# Скачать lucide (UMD версия)
curl -o public/vendor/lucide.min.js \
  https://unpkg.com/lucide@latest/dist/umd/lucide.min.js

# Проверить размер
ls -lh public/vendor/lucide.min.js
```

### Шаг 2: Обновить index.html

```html
<!-- Было: -->
<script src="https://unpkg.com/lucide@latest"></script>

<!-- Стало: -->
<script src="/vendor/lucide.min.js"></script>
```

### Шаг 3: Обновить CSP (убрать unpkg.com)

```nginx
# nginx/conf.d/common-config.conf
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';" always;
```

### Шаг 4: Закоммитить и деплоить

```bash
git add public/vendor/lucide.min.js
git add index.html
git add nginx/conf.d/common-config.conf
git commit -m "🔒 Security: Move lucide icons to local vendor"
git push
```

**Преимущества локального хранения:**
- ✅ Нет зависимости от внешних CDN
- ✅ Лучшая безопасность (строгий CSP)
- ✅ Быстрее (нет доп. DNS/TLS запросов)
- ✅ Работает offline
- ✅ Фиксированная версия (не ломается при обновлении CDN)

---

## 🔄 Rollback (если что-то пошло не так)

```bash
# Восстановить старый конфиг
docker-compose -f docker-compose.vps.yml exec nginx \
  sh -c 'cat > /etc/nginx/conf.d/common-config.conf' < /tmp/nginx-backup.conf

# Проверить
docker-compose -f docker-compose.vps.yml exec nginx nginx -t

# Перезапустить
docker-compose -f docker-compose.vps.yml restart nginx
```

---

## 📊 Итоговый чеклист

### Быстрое исправление (применено):
- [x] Обновлен CSP в nginx/conf.d/common-config.conf
- [ ] Изменения задеплоены на сервер
- [ ] Nginx перезапущен
- [ ] Проверено в браузере
- [ ] Иконки отображаются

### Долгосрочное решение (рекомендуется):
- [ ] Скачан lucide.min.js локально
- [ ] Обновлен index.html
- [ ] CSP вернут к strict mode
- [ ] Закоммичено и задеплоено

---

## 🆘 Troubleshooting

### Проблема: Иконки все еще не загружаются

```bash
# Проверить что nginx применил новый конфиг
docker-compose -f docker-compose.vps.yml exec nginx nginx -t

# Проверить CSP заголовок
curl -I https://crm.magellania.net | grep CSP

# Проверить логи nginx
docker-compose -f docker-compose.vps.yml logs nginx | tail -50

# Жесткий перезапуск nginx
docker-compose -f docker-compose.vps.yml restart nginx --force-recreate
```

### Проблема: 502 Bad Gateway после изменений

```bash
# Откатить изменения
git checkout HEAD -- nginx/conf.d/common-config.conf

# Перезапустить
docker-compose -f docker-compose.vps.yml restart nginx
```

### Проблема: Кэш браузера

- Откройте Developer Tools (F12)
- Нажмите правой кнопкой на кнопку Refresh
- Выберите "Empty Cache and Hard Reload"

---

**Применено:** CSP обновлен для разрешения unpkg.com
**Статус:** Готово к деплою
**Следующий шаг:** Применить на сервере (см. раздел "Применение на сервере")
