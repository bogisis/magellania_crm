#!/bin/bash

# Скрипт для проверки импорта каталогов после исправления

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📊 Checking catalogs in database..."
echo "================================"
echo ""

DB_PATH="/Users/bogisis/Desktop/сметы/for_deploy copy/db/quotes.db"

echo "🗂️ Catalogs count:"
sqlite3 "$DB_PATH" "SELECT COUNT(*) as total FROM catalogs WHERE deleted_at IS NULL;"
echo ""

echo "📁 Catalogs by region:"
sqlite3 "$DB_PATH" "
SELECT
    region,
    COUNT(*) as catalogs_count,
    LENGTH(data) as data_size_bytes
FROM catalogs
WHERE deleted_at IS NULL
GROUP BY region;
"
echo ""

echo "🎯 Templates count per catalog:"
sqlite3 "$DB_PATH" "
SELECT
    region,
    json_array_length(json_extract(data, '$.templates')) as templates_count,
    json_array_length(json_extract(data, '$.categories')) as categories_count
FROM catalogs
WHERE deleted_at IS NULL
ORDER BY region;
"
echo ""

echo "📊 Total templates across all catalogs:"
sqlite3 "$DB_PATH" "
SELECT
    SUM(json_array_length(json_extract(data, '$.templates'))) as total_templates
FROM catalogs
WHERE deleted_at IS NULL;
"
echo ""

echo -e "${YELLOW}💡 Hint:${NC}"
echo "   Если templates_count = 0 или NULL, значит импорт НЕ сработал"
echo "   После успешного импорта должно быть ~245 templates"
echo ""
