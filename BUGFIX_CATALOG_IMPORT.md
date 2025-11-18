# Исправление бага импорта каталога (17 ноября 2025)

## Проблема

При импорте каталога через форму "Загрузить каталог" данные сохранялись **только в localStorage**, но **НЕ отправлялись на сервер SQLite**.

В результате:
- ✅ Локально каталог отображался
- ❌ На сервере каталог отсутствовал
- ❌ При экспорте через "Экспортировать все данные" каталог не включался
- ❌ Другие пользователи не видели импортированный каталог

## Причина

Функция `loadCatalogJSON()` (index.html:9488-9729) сохраняла данные только в localStorage:

```javascript
// СТАРЫЙ КОД (баг)
this.saveToLocalStorage();  // Только localStorage
this.saveCategories();      // Только localStorage
// НЕТ отправки на сервер!
```

## Решение

Добавлена отправка каталогов на сервер через `apiClient.saveCatalog()` после сохранения в localStorage.

### Для нового формата (multi-region)

```javascript
// НОВЫЙ КОД (строки 9617-9630)
try {
    for (const region of jsonData.regions) {
        const regionData = jsonData.regionData[region];
        if (regionData) {
            const catalogFilename = `catalog_${region}.json`;
            await apiClient.saveCatalog(regionData, catalogFilename);
            console.log(`Catalog for region ${region} saved to server`);
        }
    }
} catch (serverError) {
    console.warn('Failed to save catalogs to server:', serverError.message);
    this.showNotification('⚠️ Каталоги сохранены локально, но не отправлены на сервер: ' + serverError.message, true);
}
```

### Для старого формата (single region)

```javascript
// НОВЫЙ КОД (строки 9701-9717)
try {
    const catalogData = {
        version: jsonData.version || this.CATALOG_VERSION,
        region: this.currentRegion,
        templates: this.templates,
        categories: this.categories,
        categoryStats: this.categoryStats,
        globalStats: this.globalStats
    };
    const catalogFilename = `catalog_${this.currentRegion}.json`;
    await apiClient.saveCatalog(catalogData, catalogFilename);
    console.log(`Catalog for region ${this.currentRegion} saved to server`);
} catch (serverError) {
    console.warn('Failed to save catalog to server:', serverError.message);
    this.showNotification('⚠️ Каталог сохранён локально, но не отправлен на сервер: ' + serverError.message, true);
}
```

## Изменённые файлы

- `index.html`:
  - Строки 9617-9630: отправка multi-region каталогов на сервер
  - Строки 9701-9717: отправка single-region каталога на сервер

## Тестирование

### Сценарий 1: Импорт нового формата (multi-region)

1. Создать файл каталога в новом формате:
```json
{
  "version": "1.2.0",
  "regionData": {
    "cuba": { "templates": [...], "categories": [...] },
    "peru": { "templates": [...], "categories": [...] }
  },
  "regions": ["cuba", "peru"]
}
```

2. Импортировать через "Загрузить каталог"
3. **Ожидаемый результат**:
   - ✅ Данные сохранены в localStorage
   - ✅ Данные отправлены на сервер (catalogs table)
   - ✅ В консоли: `Catalog for region cuba saved to server`
   - ✅ В консоли: `Catalog for region peru saved to server`
   - ✅ При экспорте через "Экспортировать все данные" каталоги включены

### Сценарий 2: Импорт старого формата (single region)

1. Создать файл каталога в старом формате:
```json
{
  "version": "1.0.0",
  "templates": [...],
  "categories": [...]
}
```

2. Импортировать через "Загрузить каталог"
3. **Ожидаемый результат**:
   - ✅ Данные сохранены в localStorage
   - ✅ Данные отправлены на сервер
   - ✅ В консоли: `Catalog for region [current] saved to server`
   - ✅ При экспорте через "Экспортировать все данные" каталог включён

### Сценарий 3: Ошибка сервера

1. Отключить сервер
2. Импортировать каталог
3. **Ожидаемый результат**:
   - ✅ Данные сохранены в localStorage (работает оффлайн)
   - ⚠️ Уведомление: "Каталоги сохранены локально, но не отправлены на сервер: [error]"
   - ✅ В консоли: `Failed to save catalogs to server: [error]`
   - ✅ UI продолжает работать

## Обратная совместимость

✅ **Полностью обратно совместимо**
- Не ломает существующий функционал
- Работает с обоими форматами каталогов
- Graceful degradation при ошибках сервера

## Дальнейшие улучшения (опционально)

1. **Batch API для каталогов**: вместо отправки каждого региона отдельно, отправлять все разом
2. **Индикатор прогресса**: показывать прогресс импорта для больших каталогов
3. **Retry логика**: автоматический retry при временных ошибках сети
4. **Конфликт-резолюция**: при конфликте версий спрашивать пользователя

## Related Issues

- Связано с миграцией на SQLite storage (v2.3.0)
- Следует архитектурным паттернам из `docs/ru/developer-guide/data-integrity/`

---

**Статус**: ✅ Исправлено
**Дата**: 17 ноября 2025
**Приоритет**: P0 (критический)
**Затронутые пользователи**: Все пользователи с SQLite backend
