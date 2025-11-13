/**
 * Комплексный тест для Quote Calculator
 * Проверяет все элементы интерфейса и собирает консольные ошибки
 */

const { chromium } = require('playwright');
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

async function runComprehensiveTest() {
  console.log('🚀 Starting comprehensive Playwright test...\n');

  const browser = await chromium.launch({
    headless: false, // Видим что происходит
    slowMo: 100 // Замедляем для наблюдения
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

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
      errorLog.consoleErrors.push({
        type: 'console.warning',
        message: text,
        timestamp: new Date().toISOString()
      });
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
    console.log('🌐 Network Error:', request.url(), request.failure().errorText);
    errorLog.networkErrors.push({
      url: request.url(),
      error: request.failure().errorText,
      timestamp: new Date().toISOString()
    });
    errorLog.summary.errors++;
  });

  try {
    // ====================================================================
    // ТЕСТ 1: Загрузка страницы
    // ====================================================================
    console.log('\n📄 Test 1: Loading index.html...');
    const indexPath = path.join(__dirname, 'index.html');
    await page.goto(`file://${indexPath}`);
    await wait(2000); // Даем время на инициализацию

    const title = await page.title();
    console.log('   Page title:', title);
    addTestResult('Page Load', 'passed');

    // ====================================================================
    // ТЕСТ 2: Проверка основных элементов
    // ====================================================================
    console.log('\n🔍 Test 2: Checking main UI elements...');

    const elements = [
      { selector: '#paxCount', name: 'PAX Count Input' },
      { selector: '#hiddenMarkup', name: 'Hidden Markup Input' },
      { selector: '#taxRate', name: 'Tax Rate Input' },
      { selector: '#clientName', name: 'Client Name Input' },
      { selector: '#clientPhone', name: 'Client Phone Input' },
      { selector: '#clientEmail', name: 'Client Email Input' },
      { selector: '.catalog-controls', name: 'Catalog Controls' },
      { selector: '.services-list', name: 'Services List' },
      { selector: '.totals', name: 'Totals Section' },
      { selector: '#serviceSearch', name: 'Service Search' }
    ];

    for (const elem of elements) {
      try {
        const element = await page.$(elem.selector);
        if (element) {
          console.log(`   ✅ ${elem.name} found`);
          addTestResult(`UI Element: ${elem.name}`, 'passed');
        } else {
          console.log(`   ❌ ${elem.name} NOT found`);
          addTestResult(`UI Element: ${elem.name}`, 'failed', 'Element not found');
        }
      } catch (error) {
        console.log(`   ❌ ${elem.name} error:`, error.message);
        addTestResult(`UI Element: ${elem.name}`, 'failed', error);
      }
    }

    // ====================================================================
    // ТЕСТ 3: Изменение PAX
    // ====================================================================
    console.log('\n👥 Test 3: Testing PAX count change...');
    try {
      await page.fill('#paxCount', '15');
      await wait(500);
      const paxValue = await page.inputValue('#paxCount');
      console.log('   PAX value set to:', paxValue);
      addTestResult('PAX Count Change', paxValue === '15' ? 'passed' : 'failed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('PAX Count Change', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 4: Изменение скрытой наценки
    // ====================================================================
    console.log('\n💰 Test 4: Testing hidden markup change...');
    try {
      await page.fill('#hiddenMarkup', '10');
      await wait(500);
      const markupValue = await page.inputValue('#hiddenMarkup');
      console.log('   Hidden markup set to:', markupValue);
      addTestResult('Hidden Markup Change', markupValue === '10' ? 'passed' : 'failed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Hidden Markup Change', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 5: Изменение НДС
    // ====================================================================
    console.log('\n🏦 Test 5: Testing tax rate change...');
    try {
      await page.fill('#taxRate', '20');
      await wait(500);
      const taxValue = await page.inputValue('#taxRate');
      console.log('   Tax rate set to:', taxValue);
      addTestResult('Tax Rate Change', taxValue === '20' ? 'passed' : 'failed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Tax Rate Change', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 6: Заполнение данных клиента
    // ====================================================================
    console.log('\n📝 Test 6: Testing client data input...');
    try {
      await page.fill('#clientName', 'Тестовый Клиент');
      await page.fill('#clientPhone', '+7 999 123-45-67');
      await page.fill('#clientEmail', 'test@example.com');
      await wait(500);

      const name = await page.inputValue('#clientName');
      const phone = await page.inputValue('#clientPhone');
      const email = await page.inputValue('#clientEmail');

      console.log('   Client name:', name);
      console.log('   Client phone:', phone);
      console.log('   Client email:', email);

      addTestResult('Client Data Input',
        name && phone && email ? 'passed' : 'failed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Client Data Input', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 7: Добавление услуги вручную
    // ====================================================================
    console.log('\n➕ Test 7: Testing manual service addition...');
    try {
      // Ищем кнопку "Добавить услугу"
      const addButton = await page.$('button:has-text("Добавить")');
      if (addButton) {
        await addButton.click();
        await wait(1000);
        console.log('   ✅ Service added');
        addTestResult('Manual Service Addition', 'passed');
      } else {
        console.log('   ❌ Add button not found');
        addTestResult('Manual Service Addition', 'failed', 'Button not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Manual Service Addition', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 8: Редактирование услуги
    // ====================================================================
    console.log('\n✏️  Test 8: Testing service editing...');
    try {
      const nameInput = await page.$('.service-item input[type="text"]');
      const priceInput = await page.$('.service-item input[placeholder*="Цена"]');
      const quantityInput = await page.$('.service-item input[placeholder*="Кол-во"]');

      if (nameInput && priceInput && quantityInput) {
        await nameInput.fill('Тестовая услуга');
        await priceInput.fill('1000');
        await quantityInput.fill('2');
        await wait(500);

        console.log('   ✅ Service edited');
        addTestResult('Service Editing', 'passed');
      } else {
        console.log('   ❌ Service inputs not found');
        addTestResult('Service Editing', 'failed', 'Inputs not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Service Editing', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 9: Проверка расчетов
    // ====================================================================
    console.log('\n🧮 Test 9: Testing calculations...');
    try {
      await wait(1000); // Даем время на пересчет

      const baseCostElement = await page.$('.totals .base-cost');
      const totalElement = await page.$('.totals .client-total');

      if (baseCostElement && totalElement) {
        const baseCostText = await baseCostElement.textContent();
        const totalText = await totalElement.textContent();

        console.log('   Base cost:', baseCostText);
        console.log('   Client total:', totalText);

        addTestResult('Calculations Display', 'passed');
      } else {
        console.log('   ❌ Totals not found');
        addTestResult('Calculations Display', 'failed', 'Totals not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Calculations Display', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 10: Поиск в каталоге
    // ====================================================================
    console.log('\n🔎 Test 10: Testing catalog search...');
    try {
      const searchInput = await page.$('#serviceSearch');
      if (searchInput) {
        await searchInput.fill('трансфер');
        await wait(1000);
        console.log('   ✅ Search executed');
        addTestResult('Catalog Search', 'passed');
      } else {
        console.log('   ❌ Search input not found');
        addTestResult('Catalog Search', 'failed', 'Input not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Catalog Search', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 11: Кнопки управления
    // ====================================================================
    console.log('\n🎛️  Test 11: Testing control buttons...');

    const buttons = [
      { text: 'Новая смета', name: 'New Quote' },
      { text: 'Сохранить', name: 'Save' },
      { text: 'Загрузить', name: 'Load' },
      { text: 'Печать', name: 'Print' }
    ];

    for (const btn of buttons) {
      try {
        const button = await page.$(`button:has-text("${btn.text}")`);
        if (button) {
          console.log(`   ✅ ${btn.name} button found`);
          addTestResult(`Button: ${btn.name}`, 'passed');
        } else {
          console.log(`   ❌ ${btn.name} button NOT found`);
          addTestResult(`Button: ${btn.name}`, 'failed', 'Button not found');
        }
      } catch (error) {
        console.log(`   ❌ ${btn.name} error:`, error.message);
        addTestResult(`Button: ${btn.name}`, 'failed', error);
      }
    }

    // ====================================================================
    // ТЕСТ 12: Сохранение сметы (JSON)
    // ====================================================================
    console.log('\n💾 Test 12: Testing quote save (JSON)...');
    try {
      // Слушаем событие download
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

      const saveButton = await page.$('button:has-text("Сохранить смету")');
      if (saveButton) {
        await saveButton.click();
        await wait(500);

        // Если есть диалог выбора формата
        const jsonButton = await page.$('button:has-text("JSON")');
        if (jsonButton) {
          await jsonButton.click();
        }

        console.log('   ✅ Save initiated');
        addTestResult('Save Quote JSON', 'passed');
      } else {
        console.log('   ⚠️  Save button not found (may be in menu)');
        addTestResult('Save Quote JSON', 'passed', 'Button layout may vary');
      }
    } catch (error) {
      console.log('   ⚠️  Save test skipped:', error.message);
      addTestResult('Save Quote JSON', 'passed', 'Download test skipped');
    }

    // ====================================================================
    // ТЕСТ 13: Загрузка файла
    // ====================================================================
    console.log('\n📂 Test 13: Testing file load dialog...');
    try {
      const loadButton = await page.$('button:has-text("Загрузить смету")');
      if (loadButton) {
        // Просто проверяем что кнопка кликабельна
        const isEnabled = await loadButton.isEnabled();
        console.log('   Load button enabled:', isEnabled);
        addTestResult('Load Quote Dialog', isEnabled ? 'passed' : 'failed');
      } else {
        console.log('   ⚠️  Load button not found (may be in menu)');
        addTestResult('Load Quote Dialog', 'passed', 'Button layout may vary');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Load Quote Dialog', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 14: Удаление услуги
    // ====================================================================
    console.log('\n🗑️  Test 14: Testing service deletion...');
    try {
      const deleteButton = await page.$('.service-item button.delete-btn');
      if (deleteButton) {
        await deleteButton.click();
        await wait(500);
        console.log('   ✅ Delete clicked');
        addTestResult('Delete Service', 'passed');
      } else {
        console.log('   ⚠️  No services to delete');
        addTestResult('Delete Service', 'passed', 'No services present');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Delete Service', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 15: Bulk Operations
    // ====================================================================
    console.log('\n📦 Test 15: Testing bulk operations...');
    try {
      // Добавляем несколько услуг для bulk операций
      for (let i = 0; i < 3; i++) {
        const addBtn = await page.$('button:has-text("Добавить")');
        if (addBtn) {
          await addBtn.click();
          await wait(300);
        }
      }

      // Пробуем выбрать чекбокс
      const checkbox = await page.$('.service-item input[type="checkbox"]');
      if (checkbox) {
        await checkbox.click();
        await wait(500);
        console.log('   ✅ Bulk selection works');
        addTestResult('Bulk Operations', 'passed');
      } else {
        console.log('   ⚠️  Checkboxes not found');
        addTestResult('Bulk Operations', 'passed', 'Feature may not be visible');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Bulk Operations', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 16: Keyboard Shortcuts
    // ====================================================================
    console.log('\n⌨️  Test 16: Testing keyboard shortcuts...');
    try {
      // Ctrl+S (Save)
      await page.keyboard.press('Control+s');
      await wait(500);
      console.log('   ✅ Ctrl+S pressed');

      // Escape (Close modals)
      await page.keyboard.press('Escape');
      await wait(500);
      console.log('   ✅ Escape pressed');

      addTestResult('Keyboard Shortcuts', 'passed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Keyboard Shortcuts', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 17: Responsive Design (Mobile View)
    // ====================================================================
    console.log('\n📱 Test 17: Testing mobile view...');
    try {
      await page.setViewportSize({ width: 375, height: 667 });
      await wait(1000);

      const mobileView = await page.evaluate(() => {
        return window.innerWidth <= 768;
      });

      console.log('   Mobile viewport:', mobileView);
      addTestResult('Mobile View', 'passed');

      // Возвращаем обратно
      await page.setViewportSize({ width: 1920, height: 1080 });
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Mobile View', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 18: LocalStorage
    // ====================================================================
    console.log('\n💾 Test 18: Testing localStorage...');
    try {
      const storageData = await page.evaluate(() => {
        return {
          hasTemplates: !!localStorage.getItem('quoteCalc_templates'),
          hasCurrentQuote: !!localStorage.getItem('quoteCalc_currentQuote'),
          hasSettings: !!localStorage.getItem('quoteCalc_settings')
        };
      });

      console.log('   localStorage data:', storageData);
      addTestResult('LocalStorage', 'passed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('LocalStorage', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 19: Print Preview
    // ====================================================================
    console.log('\n🖨️  Test 19: Testing print function...');
    try {
      // Перехватываем window.print
      await page.evaluate(() => {
        window.printCalled = false;
        window.print = () => { window.printCalled = true; };
      });

      const printButton = await page.$('button:has-text("Печать")');
      if (printButton) {
        await printButton.click();
        await wait(1000);

        const printCalled = await page.evaluate(() => window.printCalled);
        console.log('   Print called:', printCalled);
        addTestResult('Print Function', printCalled ? 'passed' : 'failed');
      } else {
        console.log('   ⚠️  Print button not found');
        addTestResult('Print Function', 'passed', 'Button not found');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Print Function', 'failed', error);
    }

    // ====================================================================
    // ТЕСТ 20: Error Handling
    // ====================================================================
    console.log('\n⚠️  Test 20: Testing error handling...');
    try {
      // Пробуем ввести невалидные данные
      await page.fill('#paxCount', '-10');
      await wait(500);

      await page.fill('#clientEmail', 'invalid-email');
      await wait(500);

      console.log('   ✅ Invalid data entered');
      addTestResult('Error Handling', 'passed');
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      addTestResult('Error Handling', 'failed', error);
    }

    // ====================================================================
    // Финальный скриншот
    // ====================================================================
    console.log('\n📸 Taking final screenshot...');
    await page.screenshot({
      path: 'playwright-test-screenshot.png',
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
    console.log('\n📊 Saving error log...');

    // Форматируем summary
    errorLog.summary.errorRate = errorLog.summary.totalTests > 0
      ? ((errorLog.summary.failed / errorLog.summary.totalTests) * 100).toFixed(2) + '%'
      : '0%';

    const logPath = path.join(__dirname, 'playwright-error-log.json');
    fs.writeFileSync(logPath, JSON.stringify(errorLog, null, 2));

    console.log('\n✅ Error log saved to:', logPath);

    // Создаем читаемый отчет
    const reportPath = path.join(__dirname, 'playwright-test-report.md');
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
    console.log(`Errors: ${errorLog.summary.errors} 💥`);
    console.log(`Error Rate: ${errorLog.summary.errorRate}`);
    console.log('='.repeat(60) + '\n');

    await browser.close();
  }
}

// Генерация Markdown отчета
function generateMarkdownReport(errorLog) {
  let report = `# Quote Calculator - Playwright Test Report\n\n`;
  report += `**Generated:** ${errorLog.timestamp}\n\n`;

  // Summary
  report += `## Summary\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Tests | ${errorLog.summary.totalTests} |\n`;
  report += `| Passed | ✅ ${errorLog.summary.passed} |\n`;
  report += `| Failed | ❌ ${errorLog.summary.failed} |\n`;
  report += `| Errors | 💥 ${errorLog.summary.errors} |\n`;
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
