# Quote Calculator v2.2.0 Server Edition

Генератор коммерческих предложений для туристических услуг с серверным хранилищем данных.

## Что нового в v2.2.0

🎉 **Серверное хранилище данных**:
- Все сметы сохраняются на сервере
- Каталог услуг хранится на сервере
- Автоматические бэкапы при каждом сохранении
- Автосохранение смет при редактировании
- Модальное окно со списком всех смет
- Новые кнопки управления в UI

## Быстрый старт

```bash
# Установить зависимости
npm install

# Запустить сервер
npm start

# Открыть в браузере
open http://localhost:3000
```

## Деплой

Поддерживаются несколько вариантов деплоя:

### Railway.app (рекомендуется)

```bash
git init
git add .
git commit -m "Initial commit"
git push
```

Railway автоматически обнаружит конфигурацию и задеплоит приложение.

### Docker

```bash
docker-compose up -d
```

### VPS

```bash
npm install --production
npm start
```

Подробные инструкции: **[DEPLOYMENT.md](DEPLOYMENT.md)**

## Структура проекта

```
├── server.js           # Express API сервер
├── apiClient.js        # Клиентский модуль для работы с API
├── index.html          # Основное приложение (SPA)
├── package.json        # Node.js зависимости
│
├── catalog/            # Каталоги услуг (JSON)
│   └── catalog.json
│
├── estimate/           # Сохранённые сметы (JSON)
│   └── *.json
│
├── backup/             # Автоматические бэкапы
│   └── *_timestamp_*.json
│
├── Dockerfile          # Docker конфигурация
├── docker-compose.yml  # Docker Compose
├── railway.json        # Railway.app конфигурация
└── nixpacks.toml       # Nixpacks конфигурация
```

## Возможности

### Управление сметами
- Создание и редактирование смет
- Автосохранение каждые 2 секунды
- Просмотр списка всех сохранённых смет
- Удаление смет (с автобэкапом)
- Загрузка любой сметы из списка

### Управление каталогом
- Сохранение каталога на сервере
- Загрузка каталога с сервера при старте
- Автобэкап при каждом сохранении

### Безопасность
- Автоматические бэкапы в папку `backup/`
- Валидация размера файлов (макс. 50MB)
- XSS защита
- CORS настроен

### API

**Каталог:**
- `GET /api/catalog/list` - список файлов
- `GET /api/catalog/:filename` - загрузить
- `POST /api/catalog/:filename` - сохранить

**Сметы:**
- `GET /api/estimates` - список с метаданными
- `GET /api/estimates/:filename` - загрузить
- `POST /api/estimates/:filename` - сохранить
- `PUT /api/estimates/:filename/autosave` - автосохранение
- `DELETE /api/estimates/:filename` - удалить (с бэкапом)

## UI изменения

Новые кнопки в header:
- **💾 Сохранить смету** - сохранить текущую смету на сервер
- **📋 Мои сметы** - открыть список всех смет
- **📦 Сохр. каталог** - сохранить каталог на сервер

## Конфигурация

### Переменные окружения

```bash
PORT=3000                   # Порт сервера (по умолчанию 3000)
NODE_ENV=production         # Окружение
```

### Лимиты

В `server.js`:
```javascript
express.json({ limit: '50mb' })  // Максимальный размер JSON
```

## Технологии

**Backend:**
- Node.js 18+
- Express.js
- CORS

**Frontend:**
- Vanilla JavaScript ES6+
- HTML5 + CSS3
- Lucide Icons

**Deployment:**
- Docker / Docker Compose
- Railway.app (Nixpacks)
- Systemd (VPS)

## Совместимость

### Браузеры
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Node.js
- 18.x или выше

## Миграция с localStorage

Старая версия использовала localStorage. Новая версия:
1. Всё ещё поддерживает localStorage как fallback
2. При первом сохранении данные переносятся на сервер
3. Существующие JSON файлы можно импортировать через UI

## Разработка

```bash
# Установить зависимости
npm install

# Запустить в dev режиме
npm run dev

# Логи
# Сервер выводит информацию о всех операциях в консоль
```

## Тестирование

```bash
# Проверить API
curl http://localhost:3000/api/estimates
curl http://localhost:3000/api/catalog/list

# Проверить веб-интерфейс
open http://localhost:3000
```

## Бэкапы

Автоматически создаются в `backup/` при:
- Сохранении сметы (обычное сохранение)
- Сохранении каталога
- Удалении сметы

Формат имени: `{type}_{timestamp}_{filename}`

**Не создаются при:** автосохранении (слишком частые).

## Производительность

- Размер Docker образа: ~100MB
- RAM: 50-100MB
- CPU: минимальные требования
- Поддержка до 1000+ смет

## Troubleshooting

**Проблема:** Порт 3000 занят
```bash
export PORT=3001
npm start
```

**Проблема:** Не создаются папки
```bash
mkdir -p catalog estimate backup
```

**Проблема:** Нет доступа к файлам
```bash
chmod 755 catalog estimate backup
```

## Документация

- [DEPLOYMENT.md](DEPLOYMENT.md) - Полная инструкция по деплою
- [CLAUDE.md](CLAUDE.md) - Техническая документация для разработчиков
- [docs/](docs/) - Дополнительная документация

## Лицензия

MIT License

## Автор

Quote Calculator v2.2.0 Server Edition
2024

## Поддержка

При возникновении проблем проверьте:
1. Логи сервера
2. Права доступа к папкам
3. Порт доступен
4. Node.js версия 18+

---

**Важно:** Это production-ready версия, протестированная и готовая к деплою.
