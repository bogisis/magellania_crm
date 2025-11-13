# Резервное копирование и восстановление

**Версия:** 2.3.0

## Введение

Система автоматических backup защищает данные от потери. Point-in-time recovery позволяет вернуться к любому моменту времени.

---

## Автоматические backups

### Когда создаются

**При каждом сохранении сметы:**
```javascript
// Автоматически при Ctrl+S или autosave
await saveEstimate(data);
await saveBackup(data, estimateId);  // Автоматический backup
```

**Триггеры:**
- Сохранение сметы (Ctrl+S)
- Autosave (каждые 30 сек)
- Перед массовыми операциями (>10 услуг)
- Перед импортом (перезапись)
- Перед удалением каталога

### Хранение

**База данных:**
```sql
CREATE TABLE backups (
    id TEXT PRIMARY KEY,
    estimate_id TEXT NOT NULL,
    data TEXT NOT NULL,        -- Полный JSON сметы
    data_hash TEXT,            -- Для дедупликации
    created_at TEXT NOT NULL,
    FOREIGN KEY (estimate_id) REFERENCES estimates(id)
);

CREATE INDEX idx_backups_estimate ON backups(estimate_id);
CREATE INDEX idx_backups_created ON backups(created_at DESC);
```

**Период хранения:**
```
По умолчанию: 90 дней
Автоудаление: backups старше 90 дней
Можно настроить: от 30 до 365 дней
```

### Дедупликация

**Проблема:**
```
Autosave каждые 30 сек →
30 backups за 15 минут →
Все идентичны →
Тратится место
```

**Решение:**
```javascript
const hash = sha256(JSON.stringify(data));

// Проверка перед сохранением
const lastBackup = await getLastBackup(estimateId);
if (lastBackup.data_hash === hash) {
    // Данные не изменились, не создаём backup
    return;
}

// Данные изменились, создаём backup
await createBackup(estimateId, data, hash);
```

**Результат:** Только уникальные версии

---

## Ручные backups

### Создание

**Перед критическими изменениями:**
```
1. Меню → Backup → Создать backup
2. Название: "Перед повышением цен"
3. Описание: "Цены весна 2025" (опционально)
4. Создать

Backup создан с меткой
Будет виден в списке
```

**Горячая клавиша:** Ctrl+Shift+B

### Полный backup всей системы

```
Меню → Экспорт → Полный backup

Экспортируется:
  ✅ Все сметы
  ✅ Все каталоги
  ✅ Все backups (опционально)
  ✅ Настройки
  ✅ История операций

Файл: full_backup_20250203_1530.zip
Размер: ~5-50MB в зависимости от данных
```

---

## Восстановление

### Список backups

```
Меню → Backups → История

┌──────────────────────────────────────────────┐
│ Backup                     Дата      Размер  │
├──────────────────────────────────────────────┤
│ Автосохранение            15:30     15 KB    │
│ Перед повышением цен      14:00     15 KB    │
│ Автосохранение            10:25     14 KB    │
│ Импорт каталога           09:15     15 KB    │
└──────────────────────────────────────────────┘

Фильтры:
  - За сегодня
  - За последнюю неделю
  - За месяц
  - Все
```

### Восстановление сметы

```
1. Выбрать backup в списке
2. Просмотр изменений:
   Сравнение с текущей версией
   Показывается diff (что изменилось)
3. Кнопка "Восстановить"
4. Подтверждение:
   "Восстановить смету из backup?"
   ☑ Создать backup текущей версии
   [Восстановить] [Отмена]
5. Восстановление выполнено
```

**После восстановления:**
```
Текущая версия → Backup (автоматически)
Backup → Текущая версия (восстановлена)
Уведомление: "Смета восстановлена из backup"
```

### Point-in-time recovery

**Задача:** Вернуться к состоянию на 14:00 вчера

```
1. Backups → Фильтр: Вчера
2. Сортировка по времени
3. Найти backup ~14:00
4. Просмотр → проверить содержимое
5. Восстановить
```

**Использование:**
- Откат ошибочных изменений
- Восстановление случайно удалённого
- Сравнение версий
- Аудит изменений

---

## Импорт/Экспорт для миграции

### Полный экспорт

```bash
# Через UI
Меню → Экспорт → Полный экспорт
Опции:
  ☑ Сметы
  ☑ Каталоги
  ☑ Backups
  ☑ Настройки
Экспорт → full_backup_20250203.zip

# Через API
curl http://localhost:4000/api/export/all > backup.json
```

### Структура экспорта

```
full_backup_20250203.zip
├── manifest.json
├── estimates/
│   ├── est_001.json
│   ├── est_002.json
│   └── ...
├── catalogs/
│   ├── cat_001.json
│   ├── cat_002.json
│   └── ...
├── backups/
│   ├── backup_001.json
│   └── ...
└── settings.json
```

**manifest.json:**
```json
{
  "export_date": "2025-02-03T15:30:00Z",
  "app_version": "2.3.0",
  "estimates_count": 127,
  "catalogs_count": 3,
  "backups_count": 450,
  "total_size_mb": 12.5
}
```

### Полный импорт

```
1. Меню → Импорт → Полный импорт
2. Выбрать: full_backup_20250203.zip
3. Валидация:
   ✓ Формат корректный
   ✓ Версия совместима
   ✓ Структура валидна
4. Опции:
   ○ Заменить всё
   ○ Объединить (добавить новое)
   ○ Только каталоги
   ○ Только сметы
5. Импорт (может занять минуты)
6. Завершено: "Импортировано N смет, M каталогов"
```

---

## Миграция на новый компьютер

### Подготовка (старый ПК)

```bash
1. Полный экспорт
   Меню → Экспорт → Полный backup

2. Проверка файла
   Размер > 0
   ZIP открывается без ошибок

3. Копирование
   USB флешка / Dropbox / Google Drive
```

### Установка (новый ПК)

```bash
1. Установить Quote Calculator
   См. Installation Guide

2. Запустить и проверить
   http://localhost:4000
   Убедиться, что работает

3. Импорт данных
   Меню → Импорт → Полный импорт
   Выбрать: full_backup.zip
   Опция: "Заменить всё"

4. Дождаться завершения
   Progress bar показывает процесс
   Может занять 5-10 минут

5. Проверка
   - Открыть несколько смет
   - Проверить каталоги
   - Проверить расчёты
   - Создать тестовую смету

6. Готово
   Все данные перенесены
```

**Время миграции:**
```
Установка: 5 минут
Импорт 1000 смет: ~5 минут
Проверка: 5 минут
Итого: ~15 минут
```

---

## Автоматизация backups

### Scheduled backups (Cron)

**Ежедневный backup:**
```bash
#!/bin/bash
# /scripts/daily-backup.sh

DATE=$(date +%Y%m%d)
BACKUP_DIR="/backups/daily"
API_URL="http://localhost:4000/api"

# Создать backup
curl -s "$API_URL/export/all" > "$BACKUP_DIR/backup_$DATE.json"

# Compress
gzip "$BACKUP_DIR/backup_$DATE.json"

# Upload to cloud (rclone)
rclone copy "$BACKUP_DIR/backup_$DATE.json.gz" \
  dropbox:QuoteCalc/Backups/Daily/

echo "✓ Backup $DATE completed"
```

**Добавить в crontab:**
```bash
# Backup каждый день в 3:00
0 3 * * * /scripts/daily-backup.sh

# Еженедельный архив (воскресенье 4:00)
0 4 * * 0 /scripts/weekly-backup.sh
```

### Ротация backups

**Удаление старых:**
```bash
#!/bin/bash
# Удалить backups старше 90 дней

find /backups/daily -name "backup_*.json.gz" \
  -mtime +90 -delete

echo "✓ Old backups cleaned"
```

---

## API для backups

### Создание backup

```bash
POST /api/backups
Content-Type: application/json

{
  "estimate_id": "est_001",
  "description": "Manual backup"
}

Response:
{
  "id": "backup_123",
  "created_at": "2025-02-03T15:30:00Z"
}
```

### Получение backups сметы

```bash
GET /api/estimates/:id/backups

Response:
{
  "backups": [
    {
      "id": "backup_123",
      "created_at": "2025-02-03T15:30:00Z",
      "size": 15234
    }
  ]
}
```

### Восстановление из backup

```bash
POST /api/backups/:id/restore

Response:
{
  "message": "Restored successfully",
  "estimate_id": "est_001"
}
```

---

## Troubleshooting

### Проблема: Слишком много backups

**Симптом:**
```
База данных большая (>1GB)
Тысячи backups
Система тормозит
```

**Решение:**
```bash
# Очистка старых backups
DELETE FROM backups
WHERE created_at < date('now', '-30 days')
AND description IS NULL;  -- Только автоматические

# Vacuum для уменьшения файла
VACUUM;
```

### Проблема: Backup не восстанавливается

**Ошибка:**
```
"Backup data corrupted"
"Invalid JSON format"
```

**Диагностика:**
```bash
# Проверить backup в БД
sqlite3 quotes.db "SELECT id, length(data) FROM backups WHERE id='backup_123';"

# Экспортировать для анализа
sqlite3 quotes.db "SELECT data FROM backups WHERE id='backup_123';" > backup.json

# Валидировать JSON
cat backup.json | jq .
```

**Решение:**
```
Если backup повреждён:
  1. Попробовать предыдущий backup
  2. Восстановить из полного экспорта
  3. В крайнем случае: восстановление вручную
```

---

## Лучшие практики

**Регулярность:**
```
Автоматические: каждое сохранение ✓
Ручные: перед критическими операциями
Полные: еженедельно
Офлайн: ежемесячно (external drive)
```

**Хранение:**
```
Локальные backups: 90 дней
Cloud backups: 1 год
Critical backups: бессрочно
```

**Тестирование:**
```
Раз в квартал:
  1. Восстановить из backup
  2. Проверить корректность
  3. Убедиться, что процесс работает
```

**Документация:**
```
Записывать:
  - Когда делали backup
  - Что изменяли
  - Где хранится backup
  - Как восстановить
```

---

**Назад:** [← Шаблоны](templates.md)
**Следующий раздел:** [Tips & Tricks →](../tips-and-tricks/index.md)
