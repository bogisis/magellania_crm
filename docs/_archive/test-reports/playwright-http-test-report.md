# Quote Calculator - HTTP Test Report

**Generated:** 2025-11-03T20:07:22.868Z

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 14 |
| Passed | ✅ 0 |
| Failed | ❌ 14 |
| Console Errors | 💥 0 |
| Network Errors | 🌐 1 |
| Uncaught Exceptions | 💥 1 |
| Error Rate | 100.00% |

## Test Results

### 1. ❌ Page Load via HTTP
- **Status:** failed
- **Error:** Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
[2m  - navigating to "http://localhost:3000/", waiting until "networkidle"[22m

- **Time:** 2025-11-03T20:07:30.184Z

### 2. ❌ External JS Files Loaded
- **Status:** failed
- **Error:** Some JS files not loaded
- **Time:** 2025-11-03T20:07:30.207Z

### 3. ❌ UI Element: PAX Count Input
- **Status:** failed
- **Error:** Element not found
- **Time:** 2025-11-03T20:07:33.210Z

### 4. ❌ UI Element: Hidden Markup Input
- **Status:** failed
- **Error:** Element not found
- **Time:** 2025-11-03T20:07:36.212Z

### 5. ❌ UI Element: Tax Rate Input
- **Status:** failed
- **Error:** Element not found
- **Time:** 2025-11-03T20:07:36.911Z

### 6. ❌ UI Element: Client Name Input
- **Status:** failed
- **Error:** Element not found
- **Time:** 2025-11-03T20:07:36.912Z

### 7. ❌ UI Element: Services List
- **Status:** failed
- **Error:** Element not found
- **Time:** 2025-11-03T20:07:36.913Z

### 8. ❌ PAX Count Change
- **Status:** failed
- **Error:** Error: page.fill: Target page, context or browser has been closed
- **Time:** 2025-11-03T20:07:36.913Z

### 9. ❌ Add Service
- **Status:** failed
- **Error:** Error: page.$$: Target page, context or browser has been closed
- **Time:** 2025-11-03T20:07:36.913Z

### 10. ❌ Edit Service
- **Status:** failed
- **Error:** Error: page.$: Target page, context or browser has been closed
- **Time:** 2025-11-03T20:07:36.913Z

### 11. ❌ Save Quote Button
- **Status:** failed
- **Error:** Error: page.$$: Target page, context or browser has been closed
- **Time:** 2025-11-03T20:07:36.914Z

### 12. ❌ Print Function
- **Status:** failed
- **Error:** Error: page.evaluate: Target page, context or browser has been closed
- **Time:** 2025-11-03T20:07:36.914Z

### 13. ❌ LocalStorage
- **Status:** failed
- **Error:** Error: page.evaluate: Target page, context or browser has been closed
- **Time:** 2025-11-03T20:07:36.914Z

### 14. ❌ Keyboard Shortcuts
- **Status:** failed
- **Error:** Error: keyboard.press: Target page, context or browser has been closed
- **Time:** 2025-11-03T20:07:36.914Z

## Network Errors (1)

### 1. http://localhost:3000/
- **Error:** net::ERR_CONNECTION_REFUSED
- **Time:** 2025-11-03T20:07:30.125Z

## Uncaught Exceptions (1)

### 1. page.screenshot: Target page, context or browser has been closed
```
page.screenshot: Target page, context or browser has been closed
    at runComprehensiveTest (/Users/bogisis/Desktop/сметы/for_deploy copy/playwright-http-test.js:405:16)
```
**Time:** 2025-11-03T20:07:36.915Z

