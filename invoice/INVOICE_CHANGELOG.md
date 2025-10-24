# Invoice Generator Pro - Changelog

## v1.0.1 (24 октября 2025)

### 🎨 Дизайн печати переработан

**Реализован Stripe-style template** вдохновлённый [EasyInvoicePDF](https://easy-invoice-pdf.vercel.app)

#### Добавлено
- ✅ **Yellow accent bar** (#fbbf24) сверху страницы
- ✅ **Минималистичная таблица** - убраны рамки на ячейках, только header border
- ✅ **Highlighted amount box** - выделенная сумма с due date
- ✅ **Современная типографика** - Inter-style шрифты (8-18pt)
- ✅ **Улучшенный footer** - одна строка с разделителями "·"
- ✅ **Conditional Tax column** - колонка Tax показывается только если НДС > 0

#### Изменено
- 🔄 **Header title** - "INVOICE" вместо "СЧЁТ / INVOICE" (18pt вместо 36pt)
- 🔄 **Info layout** - key-value pairs с фиксированной шириной (105px) вместо grid
- 🔄 **Client/Company** - две колонки без фона, "Bill to" label
- 🔄 **Table padding** - 12px vertical (было 8pt)
- 🔄 **Colors** - #111827 (dark gray) основной цвет вместо #1e40af (blue)
- 🔄 **Spacing** - 27px padding (было 2cm)
- 🔄 **Totals section** - right-aligned 50% width, без рамок

#### Удалено
- ❌ Удалена зависимость **Lucide Icons CDN** - все иконки заменены на emoji
- ❌ Убраны рамки на всех ячейках таблицы (кроме header)
- ❌ Убраны фоновые карточки для seller/buyer info
- ❌ Убран синий акцент (#1e40af) в заголовке

#### Технические изменения
- Обновлена функция `print()` (строки 1107-1264)
- Обновлён VERSION: '1.0.1'
- Обновлён title: "Invoice Generator Pro v1.0.1"
- Обновлена документация README

---

## v1.0.0 (24 октября 2025)

### 🚀 Первый релиз

#### Основной функционал
- ✅ Автогенерация номеров счетов `INV-YYYYMMDD-NNNN`
- ✅ Импорт смет из Quote Calculator JSON
- ✅ Расчёт цен с учётом markup, hiddenMarkup, partnerCommission
- ✅ Поддержка множества валют (USD, EUR, RUB, GBP)
- ✅ Профессиональная печать / PDF
- ✅ Автосохранение в localStorage
- ✅ JSON export/import для счетов
- ✅ Standalone HTML - один файл, работает offline

#### UI/UX
- ✅ Современный дизайн в стиле Quote Calculator
- ✅ Emoji иконки для визуальной привлекательности
- ✅ Адаптивный интерфейс (2-column grid)
- ✅ Интуитивные формы с валидацией
- ✅ Уведомления о действиях с auto-hide

#### Безопасность
- ✅ XSS protection - escapeHtml() для всех user inputs
- ✅ File size validation (5MB max)
- ✅ JSON validation при импорте
- ✅ Email validation

#### Технологии
- **Frontend**: Vanilla JavaScript ES6+
- **Styling**: CSS Custom Properties
- **Storage**: localStorage
- **Format**: JSON
- **Size**: ~45KB (один файл)
- **Dependencies**: Нет

---

## Roadmap

### v1.1.0 (планируется)
- [ ] Backend integration
- [ ] Email отправка PDF
- [ ] Переключение между Default и Stripe templates в UI
- [ ] История счетов
- [ ] Payment tracking

### v1.2.0 (планируется)
- [ ] Multi-currency с автоконверсией
- [ ] VAT calculation для EU
- [ ] Recurring invoices
- [ ] Analytics dashboard
- [ ] Logo upload для компании

### v2.0.0 (будущее)
- [ ] Интеграция в Quote Calculator
- [ ] CRM функции
- [ ] API для внешних систем
- [ ] Mobile app

---

**Документация:** См. `INVOICE_GENERATOR_README.md`
**Проект:** Quote Calculator & Invoice System
**Лицензия:** © 2025 Magellania Travel Company
