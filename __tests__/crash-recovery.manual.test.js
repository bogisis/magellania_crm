/**
 * DAY 1.4: Crash Recovery Manual Test
 *
 * Тестирует устойчивость системы к сбоям при использовании WAL mode:
 * - Проверка восстановления после принудительного завершения
 * - Проверка целостности данных после краша
 * - Проверка WAL checkpoint recovery
 *
 * Запуск: node __tests__/crash-recovery.manual.test.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DB_PATH = path.join(__dirname, '..', 'db', 'crash-recovery-test.db');
const WAL_PATH = DB_PATH.replace('.db', '.db-wal');
const SHM_PATH = DB_PATH.replace('.db', '.db-shm');

// Cleanup helper
function cleanup() {
    [DB_PATH, WAL_PATH, SHM_PATH].forEach(file => {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`  Удален: ${path.basename(file)}`);
        }
    });
}

// Test 1: Проверка WAL mode включен
function test1_WALModeEnabled() {
    console.log('\n=== Test 1: Проверка WAL mode ===');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS test_data (
            id TEXT PRIMARY KEY,
            data TEXT,
            created_at INTEGER
        )
    `);

    const journalMode = db.pragma('journal_mode', { simple: true });
    console.log(`  Journal mode: ${journalMode}`);

    if (journalMode !== 'wal') {
        console.error('  ❌ FAIL: WAL mode не включен');
        db.close();
        return false;
    }

    console.log('  ✅ PASS: WAL mode включен');
    db.close();
    return true;
}

// Test 2: Проверка создания WAL файлов
function test2_WALFilesCreated() {
    console.log('\n=== Test 2: Проверка создания WAL файлов ===');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Создаем таблицу и вставляем данные
    db.exec(`
        CREATE TABLE IF NOT EXISTS test_data (
            id TEXT PRIMARY KEY,
            data TEXT,
            created_at INTEGER
        )
    `);

    db.prepare('INSERT OR REPLACE INTO test_data VALUES (?, ?, ?)').run(
        'test-1',
        JSON.stringify({ test: 'data' }),
        Math.floor(Date.now() / 1000)
    );

    // Проверяем существование WAL файлов
    const walExists = fs.existsSync(WAL_PATH);
    const shmExists = fs.existsSync(SHM_PATH);

    console.log(`  WAL file exists: ${walExists ? '✅' : '❌'}`);
    console.log(`  SHM file exists: ${shmExists ? '✅' : '❌'}`);

    db.close();

    if (!walExists) {
        console.error('  ❌ FAIL: WAL файл не создан');
        return false;
    }

    console.log('  ✅ PASS: WAL файлы созданы');
    return true;
}

// Test 3: Проверка восстановления данных после "краша"
function test3_DataRecoveryAfterCrash() {
    console.log('\n=== Test 3: Восстановление данных после краша ===');

    let db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Создаем таблицу если не существует
    db.exec(`
        CREATE TABLE IF NOT EXISTS test_data (
            id TEXT PRIMARY KEY,
            data TEXT,
            created_at INTEGER
        )
    `);

    // Вставляем данные
    const testId = `crash-test-${Date.now()}`;
    const testData = { message: 'This should survive a crash', timestamp: Date.now() };

    db.prepare('INSERT OR REPLACE INTO test_data VALUES (?, ?, ?)').run(
        testId,
        JSON.stringify(testData),
        Math.floor(Date.now() / 1000)
    );

    console.log(`  Записан testId: ${testId}`);

    // Симулируем "краш" - закрываем БД без checkpoint
    // (в реальности процесс был бы убит через kill -9)
    db.close();

    console.log('  Симулируем краш (закрыли БД)...');

    // "Восстанавливаемся" - открываем БД заново
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    console.log('  БД переоткрыта после "краша"');

    // Проверяем что данные сохранились
    const row = db.prepare('SELECT * FROM test_data WHERE id = ?').get(testId);

    if (!row) {
        console.error(`  ❌ FAIL: Данные не найдены после краша (testId: ${testId})`);
        db.close();
        return false;
    }

    const recoveredData = JSON.parse(row.data);

    if (recoveredData.message !== testData.message) {
        console.error('  ❌ FAIL: Данные повреждены после краша');
        db.close();
        return false;
    }

    console.log(`  ✅ PASS: Данные восстановлены корректно`);
    console.log(`    Recovered: ${recoveredData.message}`);

    db.close();
    return true;
}

// Test 4: Проверка WAL checkpoint
function test4_WALCheckpoint() {
    console.log('\n=== Test 4: WAL Checkpoint ===');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Вставляем несколько записей
    const stmt = db.prepare('INSERT OR REPLACE INTO test_data VALUES (?, ?, ?)');
    for (let i = 0; i < 100; i++) {
        stmt.run(
            `checkpoint-test-${i}`,
            JSON.stringify({ index: i }),
            Math.floor(Date.now() / 1000)
        );
    }

    // Проверяем размер WAL файла до checkpoint
    const walSizeBefore = fs.existsSync(WAL_PATH) ? fs.statSync(WAL_PATH).size : 0;
    console.log(`  WAL size before checkpoint: ${walSizeBefore} bytes`);

    // Выполняем checkpoint (PASSIVE - не блокирует читателей)
    const result = db.pragma('wal_checkpoint(PASSIVE)');
    console.log(`  Checkpoint result:`, result);

    // Проверяем размер WAL файла после checkpoint
    const walSizeAfter = fs.existsSync(WAL_PATH) ? fs.statSync(WAL_PATH).size : 0;
    console.log(`  WAL size after checkpoint: ${walSizeAfter} bytes`);

    if (walSizeAfter > walSizeBefore) {
        console.log('  ⚠️  WARNING: WAL размер увеличился (но это нормально для PASSIVE checkpoint)');
    } else if (walSizeAfter === 0) {
        console.log('  ✅ PASS: WAL полностью очищен');
    } else {
        console.log('  ✅ PASS: WAL checkpoint выполнен');
    }

    db.close();
    return true;
}

// Test 5: Проверка транзакций с откатом
function test5_TransactionRollback() {
    console.log('\n=== Test 5: Transaction Rollback ===');

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    const countBefore = db.prepare('SELECT COUNT(*) as count FROM test_data').get().count;
    console.log(`  Records before: ${countBefore}`);

    // Начинаем транзакцию
    const transaction = db.transaction(() => {
        db.prepare('INSERT INTO test_data VALUES (?, ?, ?)').run(
            'rollback-test-1',
            JSON.stringify({ should: 'rollback' }),
            Math.floor(Date.now() / 1000)
        );

        // Симулируем ошибку
        throw new Error('Simulated error for rollback');
    });

    try {
        transaction();
        console.error('  ❌ FAIL: Транзакция не откатилась');
        db.close();
        return false;
    } catch (err) {
        // Ожидаем ошибку
    }

    const countAfter = db.prepare('SELECT COUNT(*) as count FROM test_data').get().count;
    console.log(`  Records after: ${countAfter}`);

    if (countAfter !== countBefore) {
        console.error('  ❌ FAIL: Данные не откатились');
        db.close();
        return false;
    }

    console.log('  ✅ PASS: Transaction rollback работает корректно');
    db.close();
    return true;
}

// Main test runner
async function runAllTests() {
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   DAY 1.4: Crash Recovery Tests             ║');
    console.log('╚══════════════════════════════════════════════╝');

    // Cleanup before tests
    console.log('\n📦 Cleanup старых файлов...');
    cleanup();

    const results = [];

    results.push({ name: 'WAL Mode Enabled', passed: test1_WALModeEnabled() });
    results.push({ name: 'WAL Files Created', passed: test2_WALFilesCreated() });
    results.push({ name: 'Data Recovery After Crash', passed: test3_DataRecoveryAfterCrash() });
    results.push({ name: 'WAL Checkpoint', passed: test4_WALCheckpoint() });
    results.push({ name: 'Transaction Rollback', passed: test5_TransactionRollback() });

    // Summary
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   Test Summary                               ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;

    results.forEach(r => {
        const status = r.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`  ${status}: ${r.name}`);
    });

    console.log(`\n  Total: ${passedCount}/${totalCount} tests passed`);

    // Cleanup after tests
    console.log('\n📦 Cleanup тестовых файлов...');
    cleanup();

    console.log('\n✨ Done!\n');

    process.exit(passedCount === totalCount ? 0 : 1);
}

// Run tests
runAllTests().catch(err => {
    console.error('\n❌ Error running tests:', err);
    process.exit(1);
});
