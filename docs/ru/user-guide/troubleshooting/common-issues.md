# Типичные проблемы и решения

**Версия:** 2.3.0

Подробные решения наиболее частых проблем с пошаговыми инструкциями.

---

## Установка и запуск

### Сервер не запускается

**Симптом:**
```bash
npm start
# Ошибка: Error: EADDRINUSE: address already in use :::4000
```

**Причина:** Порт 4000 уже занят другим процессом

**Решение:**

**Вариант 1: Убить процесс на порту 4000**
```bash
# Найти процесс
lsof -ti:4000

# Убить процесс
lsof -ti:4000 | xargs kill -9

# Запустить заново
npm start
```

**Вариант 2: Изменить порт**
```bash
# В server-with-db.js изменить:
const PORT = process.env.PORT || 4001;

# Или через env:
PORT=4001 npm start
```

**Проверка:**
```bash
curl http://localhost:4000/health
# Должно вернуть: {"status":"ok"}
```

---

### База данных не создаётся

**Симптом:**
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**Причина:** Нет прав на запись или папка db/ не существует

**Решение:**

**1. Создать папку:**
```bash
mkdir -p db
chmod 755 db
```

**2. Проверить права:**
```bash
ls -la db/
# Должно быть: drwxr-xr-x
```

**3. Запустить миграции:**
```bash
node db/migrations/runner.js
```

**4. Проверить создание БД:**
```bash
ls -lh db/quotes.db
# Должен появиться файл quotes.db
```

---

### Frontend не открывается

**Симптом:** Белая страница или 404 Not Found

**Причины и решения:**

**1. Сервер не запущен**
```bash
# Проверить:
curl http://localhost:4000/health

# Если ошибка - запустить:
npm start
```

**2. Неправильный порт**
```
Проверить адрес:
http://localhost:4000  (НЕ 3000!)
```

**3. CORS проблема**
```javascript
// В server-with-db.js должно быть:
app.use(cors({
  origin: '*',
  credentials: true
}));
```

**4. Браузер кеш**
```
Ctrl+Shift+R (hard reload)
Или:
DevTools → Network → Disable cache
```

---

## Работа со сметами

### Смета не сохраняется

**Симптом:** После Ctrl+S данные пропадают при перезагрузке

**Диагностика:**

**1. Проверить статус запроса:**
```javascript
// Открыть DevTools → Network
// Нажать Ctrl+S
// Найти запрос: PUT /api/estimates/:id
// Проверить статус: должен быть 200 OK
```

**2. Проверить console на ошибки:**
```javascript
// DevTools → Console
// Искать красные ошибки
```

**Возможные причины:**

**Причина 1: Сервер недоступен**
```bash
# Проверить:
curl http://localhost:4000/health

# Решение: запустить сервер
npm start
```

**Причина 2: БД заблокирована**
```bash
# Проверить процессы SQLite:
lsof db/quotes.db

# Если есть зависшие - убить:
lsof db/quotes.db | awk 'NR>1 {print $2}' | xargs kill -9
```

**Причина 3: Нет места на диске**
```bash
df -h
# Если диск заполнен - освободить место
```

**Причина 4: Validation ошибка**
```javascript
// Проверить response в DevTools:
{
  "error": "Validation failed",
  "details": ["client.name is required"]
}

// Решение: заполнить обязательные поля
```

---

### Данные "прилипают" между сметами

**Симптом:**
```
1. Открыли смету А (10 услуг)
2. Открыли смету Б (5 услуг)
3. В смете Б видим 15 услуг (А + Б)
```

**Причина:** Баг в v2.2.0 (исправлен в v2.3.0)

**Решение:**

**Временное (для v2.2.0):**
```
1. Открыть смету
2. Подождать 5 секунд (!)
3. Только потом редактировать
4. НЕ переключаться между сметами быстро
```

**Постоянное:**
```
Обновиться до v2.3.0 или новее
```

**Проверка версии:**
```javascript
// DevTools → Console:
console.log(window.APP_VERSION);
// Должно быть: "2.3.0" или выше
```

---

### Расчёты неправильные

**Симптом:** Итоговая сумма не сходится с ожидаемой

**Диагностика:**

**1. Проверить порядок расчётов:**
```javascript
// Правильный порядок (СТРОГО):
baseCost = Σ(price × quantity)
serviceWithMarkup = price × quantity × (1 + markup/100)
hiddenMarkup = baseCost × (hiddenMarkup/100)
tax = totalWithMarkup × (taxRate/100)
clientTotal = totalWithMarkup + tax
```

**2. Проверить панель расчётов:**
```
Открыть смету
Посмотреть панель справа:
  - Базовая стоимость
  - Индивидуальные наценки
  - Скрытая наценка
  - НДС
  - Итого клиенту
  - Общая прибыль
```

**Частые ошибки:**

**Ошибка 1: НДС от базовой вместо от суммы с наценками**
```javascript
// ❌ Неправильно:
tax = baseCost × (taxRate/100)

// ✅ Правильно:
tax = totalWithMarkup × (taxRate/100)
```

**Ошибка 2: Скрытая наценка в clientTotal**
```javascript
// ❌ Неправильно:
clientTotal = baseCost + individualMarkup + hiddenMarkup + tax

// ✅ Правильно:
clientTotal = baseCost + individualMarkup + tax
// hiddenMarkup только в profit!
```

**Ошибка 3: Округление**
```javascript
// Проверить, что цены округлены до 2 знаков:
$25.3456 → $25.35 (автоматически)
```

**Если всё равно не сходится:**
```
1. Экспортировать смету → estimate.json
2. Открыть в редакторе
3. Проверить поля:
   - services[].price
   - services[].quantity
   - services[].markup
   - pricing.hiddenMarkup
   - pricing.taxRate
4. Пересчитать вручную
5. Сравнить с результатом системы
```

---

## Каталоги и импорт

### Кириллица в CSV отображается как `??????`

**Симптом:**
```csv
name,price,category
???????,100,transport
```

**Причина:** Неправильная кодировка файла

**Решение:**

**При экспорте из Quote Calculator:**
```
1. Каталог → Экспорт
2. Формат: CSV
3. Кодировка: UTF-8 BOM ✓  (ВАЖНО!)
4. Экспорт
```

**При импорте внешнего CSV:**

**Способ 1: Пересохранить в правильной кодировке**
```
1. Открыть CSV в VS Code / Sublime Text
2. Проверить текущую кодировку (внизу справа)
3. Если не UTF-8:
   - Save with Encoding → UTF-8 with BOM
4. Импортировать в Quote Calculator
```

**Способ 2: Через Excel (Windows)**
```
1. Открыть CSV в Excel
2. File → Save As
3. Save as type: CSV UTF-8 (Comma delimited) (*.csv)
4. Save
```

**Способ 3: Через LibreOffice**
```
1. Открыть CSV
2. При открытии выбрать:
   Character set: UTF-8
3. File → Save As
4. Character set: UTF-8
5. Save
```

**Лучшее решение: Использовать JSON**
```
JSON не имеет проблем с кодировками
Рекомендуется для каталогов с кириллицей
```

---

### UNIQUE constraint failed

**Симптом:**
```
Error: UNIQUE constraint failed: catalogs.name, catalogs.region
```

**Причина:** Каталог с таким (name, region) уже существует

**Диагностика:**
```sql
sqlite3 db/quotes.db "SELECT id, name, region FROM catalogs;"

# Пример вывода:
# cat_001|Стандартные услуги|Indonesia
# cat_002|Стандартные услуги|Georgia
```

**Решения:**

**Вариант 1: Изменить название**
```
Старое: "Стандартные услуги"
Новое:  "Стандартные услуги v2" или "Услуги Бали"
```

**Вариант 2: Изменить регион**
```
Если импортируете для другой страны:
Region: "Thailand" (вместо "Indonesia")
```

**Вариант 3: Удалить существующий**
```
1. Каталог → Список каталогов
2. Найти дубликат
3. Удалить (будет backup)
4. Импортировать новый
```

**Вариант 4: Обновить существующий**
```
1. Открыть существующий каталог
2. Меню → Импорт → Объединить
3. Новые услуги добавятся к существующим
```

---

### Импорт CSV не добавляет услуги

**Симптом:** Импорт завершается без ошибок, но услуги не появляются

**Причины:**

**Причина 1: Неправильный формат CSV**

**Проверить заголовки:**
```csv
name,price,quantity,category
Трансфер,25,1,transport
```

**Обязательные поля:**
- `name` - название услуги
- `price` - цена (число)

**Опциональные поля:**
- `quantity` (по умолчанию 1)
- `category` (по умолчанию "other")
- `markup` (по умолчанию 0)

**Причина 2: Некорректные данные**
```csv
# ❌ Неправильно:
name,price,category
Трансфер,двадцать пять,transport  # price не число!

# ✅ Правильно:
name,price,category
Трансфер,25,transport
```

**Причина 3: Пустые строки**
```csv
name,price,category
Трансфер,25,transport

,,,  # Пустая строка - игнорируется

Экскурсия,50,excursion
```

**Решение:**
```
1. Открыть CSV в редакторе
2. Проверить формат
3. Удалить пустые строки
4. Проверить, что price - числа
5. Пересохранить
6. Импортировать заново
```

---

### Дубликаты услуг после импорта

**Симптом:** После импорта каталога появились дубликаты

**Причина:** Импорт в режиме "Добавить" вместо "Заменить"

**Решение:**

**Вариант 1: Удалить дубликаты вручную**
```
1. Каталог → Сортировка по названию
2. Найти дубли визуально
3. Выбрать дубликаты (Ctrl+Click)
4. Delete → Подтвердить
```

**Вариант 2: Переимпортировать с заменой**
```
1. Каталог → Экспорт (backup текущего)
2. Каталог → Удалить все услуги
3. Импорт каталога заново
4. Опция: Заменить всё
```

**Вариант 3: Очистка через SQL**
```sql
-- Удалить дубликаты, оставить только первые
DELETE FROM catalog_templates
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM catalog_templates
  GROUP BY name, catalog_id
);
```

**Предотвращение:**
```
Перед импортом:
  ☑ Создать backup каталога
  ☐ Добавить к существующим
  ☑ Заменить всё  (если хотите избежать дублей)
```

---

## Backups и восстановление

### Backup не восстанавливается

**Симптом:**
```
Error: Backup data corrupted
или
Error: Invalid JSON format
```

**Диагностика:**

**1. Проверить backup в БД:**
```bash
sqlite3 db/quotes.db "SELECT id, length(data), created_at FROM backups WHERE id='backup_123';"

# Пример вывода:
# backup_123|15234|2025-02-03T15:30:00Z
```

**2. Экспортировать backup:**
```bash
sqlite3 db/quotes.db "SELECT data FROM backups WHERE id='backup_123';" > backup.json
```

**3. Валидировать JSON:**
```bash
cat backup.json | jq .

# Если ошибка:
# parse error: Invalid numeric literal at line 1, column 10
# → JSON повреждён
```

**Решения:**

**Решение 1: Попробовать предыдущий backup**
```
1. Backups → История
2. Найти backup раньше на 5-10 минут
3. Попробовать восстановить его
```

**Решение 2: Восстановить из полного экспорта**
```
Если есть full_backup.zip:
1. Меню → Импорт → Полный импорт
2. Выбрать full_backup.zip
3. Восстановить
```

**Решение 3: Ручная починка JSON**
```bash
# Экспортировать повреждённый backup
sqlite3 db/quotes.db "SELECT data FROM backups WHERE id='backup_123';" > broken.json

# Открыть в редакторе
code broken.json

# Найти и исправить ошибки:
# - Незакрытые скобки
# - Лишние запятые
# - Неэкранированные кавычки

# Валидировать
cat broken.json | jq .

# Если OK - импортировать как новую смету
```

**Предотвращение:**
```
1. Регулярные полные экспорты (еженедельно)
2. Хранить экспорты вне системы (Dropbox, USB)
3. Тестировать восстановление раз в месяц
```

---

### Слишком много backups - БД большая

**Симптом:**
```bash
ls -lh db/quotes.db
# 1.2GB  # Слишком большой!
```

**Причина:** Тысячи автоматических backups

**Проверка:**
```sql
sqlite3 db/quotes.db "SELECT COUNT(*) FROM backups;"
# 15432  # Слишком много!

sqlite3 db/quotes.db "SELECT COUNT(*) FROM backups WHERE description IS NULL;"
# 15200  # Почти все автоматические
```

**Решение:**

**Вариант 1: Удалить старые автоматические backups**
```sql
sqlite3 db/quotes.db "
DELETE FROM backups
WHERE created_at < date('now', '-30 days')
AND description IS NULL;
"

# Vacuum для уменьшения размера файла
sqlite3 db/quotes.db "VACUUM;"
```

**Вариант 2: Через UI**
```
Меню → Backups → Очистка
Удалить старше: 30 дней
Тип: Только автоматические
→ Очистить
→ Оптимизировать БД
```

**Результат:**
```bash
# До:
-rw-r--r--  1 user  staff   1.2G Feb  3 15:30 quotes.db

# После:
-rw-r--r--  1 user  staff    85M Feb  3 15:35 quotes.db
```

**Настройка retention:**
```javascript
// В server-with-db.js:
const BACKUP_RETENTION_DAYS = 30;  // Изменить с 90 на 30
```

---

### Автоматический backup не создаётся

**Симптом:** После Ctrl+S backup не появляется в списке

**Причина:** Дедупликация - данные не изменились

**Проверка:**
```sql
SELECT id, created_at, data_hash
FROM backups
WHERE estimate_id = 'est_042'
ORDER BY created_at DESC
LIMIT 5;

# Если data_hash одинаковые - дубликаты не создаются
```

**Это нормально!** Дедупликация экономит место.

**Если действительно НЕ создаются:**

**1. Проверить права на запись:**
```bash
ls -la db/
# Должно быть: drwxr-xr-x
```

**2. Проверить место на диске:**
```bash
df -h
# Убедиться, что есть свободное место
```

**3. Проверить логи:**
```javascript
// DevTools → Console
// При Ctrl+S должно быть:
// "Saving estimate..."
// "Backup created: backup_456"
```

**4. Ручное создание backup:**
```
Ctrl+Shift+B
Название: "Тест"
→ Должен создаться с описанием "Тест"
```

---

## API и интеграция

### 404 Not Found при запросе к API

**Симптом:**
```bash
curl http://localhost:4000/api/estimates/est_001
# 404 Not Found
```

**Причины:**

**Причина 1: Сервер не запущен**
```bash
curl http://localhost:4000/health
# curl: (7) Failed to connect to localhost port 4000: Connection refused

# Решение:
npm start
```

**Причина 2: Неправильный endpoint**
```bash
# ❌ Неправильно:
GET /estimates/est_001

# ✅ Правильно:
GET /api/estimates/est_001
```

**Причина 3: Смета не существует**
```bash
# Проверить:
curl http://localhost:4000/api/estimates

# Найти правильный ID в списке
```

**Причина 4: Неправильный метод**
```bash
# ❌ Неправильно:
curl -X POST http://localhost:4000/api/estimates/est_001

# ✅ Правильно:
curl -X GET http://localhost:4000/api/estimates/est_001
```

---

### 500 Internal Server Error

**Симптом:**
```bash
curl -X POST http://localhost:4000/api/estimates
# 500 Internal Server Error
```

**Диагностика:**

**1. Проверить логи сервера:**
```bash
# В консоли где запущен npm start:
# Error: SQLITE_ERROR: no such table: estimates
```

**2. Частые причины:**

**Причина 1: БД не инициализирована**
```bash
# Решение: запустить миграции
node db/migrations/runner.js
```

**Причина 2: Некорректный JSON в request**
```bash
# ❌ Неправильно:
curl -X POST http://localhost:4000/api/estimates \
  -H "Content-Type: application/json" \
  -d '{invalid json}'

# ✅ Правильно:
curl -X POST http://localhost:4000/api/estimates \
  -H "Content-Type: application/json" \
  -d '{"data":{"client":{"name":"Test"}},"client_name":"Test"}'
```

**Причина 3: Validation error**
```bash
# Response:
{
  "error": "Validation failed",
  "details": ["client_name is required"]
}

# Решение: добавить обязательное поле
```

**Причина 4: БД заблокирована**
```bash
# Проверить:
lsof db/quotes.db

# Убить зависшие процессы:
lsof db/quotes.db | awk 'NR>1 {print $2}' | xargs kill -9
```

---

## Производительность

### UI медленно работает с большими каталогами

**Симптом:** Лаги, залипание при прокрутке каталога 1000+ услуг

**Решения:**

**1. Фильтрация по категории:**
```
Вместо показа всех 1000 услуг:
Фильтр: category = "transport"
→ Показываются только 50 услуг категории
```

**2. Разделение каталогов:**
```
Вместо:
  "Все услуги" (1000 services)

Создать:
  "Трансферы" (100 services)
  "Отели" (200 services)
  "Экскурсии" (300 services)
  "Активности" (150 services)
```

**3. Пагинация (планируется v2.4.0):**
```
Показывать по 50 услуг
Подгружать при прокрутке
```

**4. Оптимизация браузера:**
```
Chrome DevTools → Performance
Записать profile при прокрутке
Найти bottleneck
```

---

### Autosave вызывает лаги

**Симптом:** Каждые 30 секунд система "замирает" на 1-2 секунды

**Причина:** Большой размер сметы + медленная БД операция

**Решение:**

**1. Проверить размер БД:**
```bash
ls -lh db/quotes.db
# Если >500MB - очистить старые backups
```

**2. Очистить backups:**
```sql
DELETE FROM backups WHERE created_at < date('now', '-30 days');
VACUUM;
```

**3. Уменьшить количество услуг в смете:**
```
Если смета >100 услуг - разделить на несколько
```

**4. Увеличить debounce delay (временно):**
```javascript
// В index.html найти:
const AUTOSAVE_DELAY = 30000;  // 30 сек

// Изменить на:
const AUTOSAVE_DELAY = 60000;  // 60 сек
```

---

**Назад:** [← FAQ](faq.md)
**Вверх:** [Troubleshooting Index](index.md)
