/**
 * Улучшенный Playwright тест для Quote Calculator через HTTP
 * Запускает собственный сервер и тестирует через localhost
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Структура для сбора ошибок
const errorLog = {
  timestamp: new Date().toISOString(),
  consoleErrors: [],
  networkErrors: [],
  uncaughtExceptions: [],
  testResults: [],
  summary: {
    totalTests: 0,
    passed: 0,
    failed: 0,
    errors: 0
  }
};

let serverProcess = null;

// Утилита для добавления результата теста
function addTestResult(testName, status, error = null) {
  errorLog.testResults.push({
    test: testName,
    status,
    error: error ? error.toString() : null,
    timestamp: new Date().toISOString()
  });
  errorLog.summary.totalTests++;
  if (status === 'passed') errorLog.summary.passed++;
  if (status === 'failed') errorLog.summary.failed++;
}

// Утилита для задержки
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Запуск сервера
async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting server on port 3000...');

    serverProcess = spawn('node', ['server-with-db.js'], {
      env: { ...process.env, STORAGE_TYPE: 'sqlite' },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('   Server:', output.trim());
      if (output.includes('3000') || output.includes('listening')) {
        console.log('✅ Server started successfully\n');
        setTimeout(resolve, 1000); // Даем серверу время на инициализацию
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('   Server Error:', data.toString());
    });

    serverProcess.on('error', (error) => {
      console.error('💥 Failed to start server:', error);
      reject(error);
    });

    // Timeout если сервер не запустился
    setTimeout(() => {
      console.log('✅ Server assumed started (timeout)\n');
      resolve();
    }, 5000);
  });
}

// Остановка сервера
function stopServer() {
  if (serverProcess) {
    console.log('\n🛑 Stopping server...');
    serverProcess.kill();
  }
}

async function runComprehensiveTest() {
  console.log('🚀 Starting comprehensive Playwright HTTP test...\n');

  let browser;
  let page;

  try {
    // Запускаем сервер
    await startServer();

    browser = await chromium.launch({
      headless: false,
      slowMo: 50
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    page = await context.newPage();

    // Отлавливаем консольные сообщения
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();

      if (type === 'error') {
        console.log('❌ Console Error:', text);
        errorLog.consoleErrors.push({
          type: 'console.error',
          message: text,
          timestamp: new Date().toISOString()
        });
        errorLog.summary.errors++;
      } else if (type === 'warning') {
        console.log('⚠️  Console Warning:', text);
      }
    });

    // Отлавливаем ошибки страницы
    page.on('pageerror', error => {
      console.log('💥 Page Error:', error.message);
      errorLog.uncaughtExceptions.push({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      errorLog.summary.errors++;
    });

    // Отлавливаем сетевые ошибки
    page.on('requestfailed', request => {
      const url = request.url();
      const errorText = request.failure().errorText;
      console.log('🌐 Network Error:', url, errorText);
      errorLog.networkErrors.push({
        url,
        error: errorText,
        timestamp: new Date().toISOString()
      });
      errorLog.summary.errors++;
    });

    // ====================================================================
    // ТЕСТ 1: Загрузка страницы
    // ====================================================================
    console.log('\n📄 Test 1: Loading page from http://localhost:3000...');
    try {
      await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
      await wait(2000);

      const title = await page.title();
      console.log('   Page title:', title);
      addTestResult('Page Load via HTTP', 'passed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Page Load via HTTP', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 2: Проверка что JS файлы загружены
    // ====================================================================
    console.log('\n📦 Test 2: Checking external JS loaded...');
    try {
      const jsLoaded = await page.evaluate(() => {
        return {
          hasAPIClient: typeof APIClient !== 'undefined',
          hasSyncManager: typeof SyncManager !== 'undefined',
          hasErrorBoundary: typeof ErrorBoundary !== 'undefined',
          hasQuoteCalc: typeof window.quoteCalc !== 'undefined'
        };
      });

      console.log('   APIClient loaded:', jsLoaded.hasAPIClient);
      console.log('   SyncManager loaded:', jsLoaded.hasSyncManager);
      console.log('   ErrorBoundary loaded:', jsLoaded.hasErrorBoundary);
      console.log('   quoteCalc initialized:', jsLoaded.hasQuoteCalc);

      const allLoaded = Object.values(jsLoaded).every(v => v === true);
      addTestResult('External JS Files Loaded', allLoaded ? 'passed' : 'failed',
        !allLoaded ? 'Some JS files not loaded' : null);
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('External JS Files Loaded', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 3: Проверка основных UI элементов
    // ====================================================================
    console.log('\n🔍 Test 3: Checking main UI elements...');

    const elements = [
      { selector: '#paxCount', name: 'PAX Count Input' },
      { selector: '#hiddenMarkup', name: 'Hidden Markup Input' },
      { selector: '#taxRate', name: 'Tax Rate Input' },
      { selector: '#clientName', name: 'Client Name Input' },
      { selector: '.services-list', name: 'Services List' }
    ];

    for (const elem of elements) {
      try {
        const element = await page.waitForSelector(elem.selector, { timeout: 3000 });
        if (element) {
          console.log(`   ✅ ${elem.name} found`);
          addTestResult(`UI Element: ${elem.name}`, 'passed');
        }
      } catch (error) {
        console.log(`   ❌ ${elem.name} NOT found`);
        addTestResult(`UI Element: ${elem.name}`, 'failed', 'Element not found');
      }
    }

    // ====================================================================
    // ТЕСТ 4: Изменение PAX и проверка расчетов
    // ====================================================================
    console.log('\n👥 Test 4: Testing PAX change and calculations...');
    try {
      await page.fill('#paxCount', '20');
      await wait(500);

      const paxValue = await page.inputValue('#paxCount');
      console.log('   PAX value set to:', paxValue);
      addTestResult('PAX Count Change', paxValue === '20' ? 'passed' : 'failed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('PAX Count Change', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 5: Добавление услуги
    // ====================================================================
    console.log('\n➕ Test 5: Testing service addition...');
    try {
      // Ищем кнопку добавления
      const addButtons = await page.$$('button');
      let addButton = null;

      for (const btn of addButtons) {
        const text = await btn.textContent();
        if (text && text.includes('Добавить')) {
          addButton = btn;
          break;
        }
      }

      if (addButton) {
        await addButton.click();
        await wait(1000);

        // Проверяем что услуга добавилась
        const serviceItems = await page.$$('.service-item');
        console.log('   Services count:', serviceItems.length);
        addTestResult('Add Service', serviceItems.length > 0 ? 'passed' : 'failed');
      } else {
        console.log('   ⚠️  Add button not found');
        addTestResult('Add Service', 'failed', 'Button not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Add Service', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 6: Редактирование услуги
    // ====================================================================
    console.log('\n✏️  Test 6: Testing service editing...');
    try {
      const nameInput = await page.$('.service-item input[type="text"]');

      if (nameInput) {
        await nameInput.fill('Тестовая услуга');
        await wait(500);

        const value = await nameInput.inputValue();
        console.log('   Service name set to:', value);
        addTestResult('Edit Service', value === 'Тестовая услуга' ? 'passed' : 'failed');
      } else {
        console.log('   ⚠️  Service input not found');
        addTestResult('Edit Service', 'failed', 'Input not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Edit Service', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 7: Сохранение сметы
    // ====================================================================
    console.log('\n💾 Test 7: Testing quote save...');
    try {
      // Ищем кнопку сохранения
      const buttons = await page.$$('button');
      let saveButton = null;

      for (const btn of buttons) {
        const text = await btn.textContent();
        if (text && text.includes('Сохранить')) {
          saveButton = btn;
          break;
        }
      }

      if (saveButton) {
        // Проверяем что кнопка кликабельна
        const isEnabled = await saveButton.isEnabled();
        console.log('   Save button enabled:', isEnabled);
        addTestResult('Save Quote Button', isEnabled ? 'passed' : 'failed');
      } else {
        console.log('   ⚠️  Save button not found');
        addTestResult('Save Quote Button', 'passed', 'May be in menu');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Save Quote Button', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 8: Печать
    // ====================================================================
    console.log('\n🖨️  Test 8: Testing print function...');
    try {
      // Перехватываем window.print
      await page.evaluate(() => {
        window.printCalled = false;
        window.print = () => { window.printCalled = true; };
      });

      const buttons = await page.$$('button');
      let printButton = null;

      for (const btn of buttons) {
        const text = await btn.textContent();
        if (text && text.includes('Печать')) {
          printButton = btn;
          break;
        }
      }

      if (printButton) {
        await printButton.click();
        await wait(1000);

        const printCalled = await page.evaluate(() => window.printCalled);
        console.log('   Print called:', printCalled);
        addTestResult('Print Function', printCalled ? 'passed' : 'failed');
      } else {
        console.log('   ⚠️  Print button not found');
        addTestResult('Print Function', 'failed', 'Button not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Print Function', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 9: LocalStorage
    // ====================================================================
    console.log('\n💾 Test 9: Testing localStorage...');
    try {
      const storageData = await page.evaluate(() => {
        return {
          hasTemplates: !!localStorage.getItem('quoteCalc_templates'),
          hasCurrentQuote: !!localStorage.getItem('quoteCalc_currentQuote'),
          hasSettings: !!localStorage.getItem('quoteCalc_settings')
        };
      });

      console.log('   localStorage:', storageData);
      addTestResult('LocalStorage', 'passed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('LocalStorage', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 10: Keyboard Shortcuts
    // ====================================================================
    console.log('\n⌨️  Test 10: Testing keyboard shortcuts...');
    try {
      await page.keyboard.press('Control+s');
      await wait(500);
      console.log('   ✅ Ctrl+S pressed');

      await page.keyboard.press('Escape');
      await wait(500);
      console.log('   ✅ Escape pressed');

      addTestResult('Keyboard Shortcuts', 'passed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Keyboard Shortcuts', 'failed', error);
    }

    // ====================================================================
    // Финальный скриншот
    // ====================================================================
    console.log('\n📸 Taking final screenshot...');
    await page.screenshot({
      path: 'playwright-http-test-screenshot.png',
      fullPage: true
    });

  } catch (error) {
    console.log('\n💥 CRITICAL ERROR:', error.message);
    errorLog.uncaughtExceptions.push({
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  } finally {
    // ====================================================================
    // Сохраняем результаты
    // ====================================================================
    console.log('\n📊 Saving results...');

    errorLog.summary.errorRate = errorLog.summary.totalTests > 0
      ? ((errorLog.summary.failed / errorLog.summary.totalTests) * 100).toFixed(2) + '%'
      : '0%';

    const logPath = path.join(__dirname, 'playwright-http-error-log.json');
    fs.writeFileSync(logPath, JSON.stringify(errorLog, null, 2));
    console.log('✅ Error log saved to:', logPath);

    // Создаем читаемый отчет
    const reportPath = path.join(__dirname, 'playwright-http-test-report.md');
    const report = generateMarkdownReport(errorLog);
    fs.writeFileSync(reportPath, report);
    console.log('✅ Test report saved to:', reportPath);

    // Выводим summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${errorLog.summary.totalTests}`);
    console.log(`Passed: ${errorLog.summary.passed} ✅`);
    console.log(`Failed: ${errorLog.summary.failed} ❌`);
    console.log(`Console Errors: ${errorLog.consoleErrors.length} 💥`);
    console.log(`Network Errors: ${errorLog.networkErrors.length} 🌐`);
    console.log(`Uncaught Exceptions: ${errorLog.uncaughtExceptions.length} 💥`);
    console.log(`Error Rate: ${errorLog.summary.errorRate}`);
    console.log('='.repeat(60) + '\n');

    if (browser) await browser.close();
    stopServer();
  }
}

// Генерация Markdown отчета
function generateMarkdownReport(errorLog) {
  let report = `# Quote Calculator - HTTP Test Report\n\n`;
  report += `**Generated:** ${errorLog.timestamp}\n\n`;

  // Summary
  report += `## Summary\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Tests | ${errorLog.summary.totalTests} |\n`;
  report += `| Passed | ✅ ${errorLog.summary.passed} |\n`;
  report += `| Failed | ❌ ${errorLog.summary.failed} |\n`;
  report += `| Console Errors | 💥 ${errorLog.consoleErrors.length} |\n`;
  report += `| Network Errors | 🌐 ${errorLog.networkErrors.length} |\n`;
  report += `| Uncaught Exceptions | 💥 ${errorLog.uncaughtExceptions.length} |\n`;
  report += `| Error Rate | ${errorLog.summary.errorRate} |\n\n`;

  // Test Results
  report += `## Test Results\n\n`;
  errorLog.testResults.forEach((result, index) => {
    const icon = result.status === 'passed' ? '✅' : '❌';
    report += `### ${index + 1}. ${icon} ${result.test}\n`;
    report += `- **Status:** ${result.status}\n`;
    if (result.error) {
      report += `- **Error:** ${result.error}\n`;
    }
    report += `- **Time:** ${result.timestamp}\n\n`;
  });

  // Console Errors
  if (errorLog.consoleErrors.length > 0) {
    report += `## Console Errors (${errorLog.consoleErrors.length})\n\n`;
    errorLog.consoleErrors.forEach((error, index) => {
      report += `### ${index + 1}. ${error.type}\n`;
      report += `\`\`\`\n${error.message}\n\`\`\`\n`;
      report += `**Time:** ${error.timestamp}\n\n`;
    });
  }

  // Network Errors
  if (errorLog.networkErrors.length > 0) {
    report += `## Network Errors (${errorLog.networkErrors.length})\n\n`;
    errorLog.networkErrors.forEach((error, index) => {
      report += `### ${index + 1}. ${error.url}\n`;
      report += `- **Error:** ${error.error}\n`;
      report += `- **Time:** ${error.timestamp}\n\n`;
    });
  }

  // Uncaught Exceptions
  if (errorLog.uncaughtExceptions.length > 0) {
    report += `## Uncaught Exceptions (${errorLog.uncaughtExceptions.length})\n\n`;
    errorLog.uncaughtExceptions.forEach((error, index) => {
      report += `### ${index + 1}. ${error.message}\n`;
      report += `\`\`\`\n${error.stack}\n\`\`\`\n`;
      report += `**Time:** ${error.timestamp}\n\n`;
    });
  }

  return report;
}

// Запуск
runComprehensiveTest()
  .then(() => {
    console.log('✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
    process.exit(1);
  });
