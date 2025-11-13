#!/bin/bash
# Quick fix script for remaining Direct DB tests

# Backup original
cp __tests__/storage/SQLiteStorage.direct.test.js __tests__/storage/SQLiteStorage.direct.test.js.backup

# Update JSON extraction tests
sed -i.tmp '179,189s|db.prepare.*INSERT INTO estimates.*run.*|insertEstimate("extract123", "extract.json", testData, 1);|' __tests__/storage/SQLiteStorage.direct.test.js

# Cleanup temp files
rm -f __tests__/storage/SQLiteStorage.direct.test.js.tmp

echo "Direct tests updated"
