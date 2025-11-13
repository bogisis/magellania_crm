import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:4000", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # --> Assertions to verify final state
        frame = context.pages[-1]
        await expect(frame.locator('text=MAGELLANIA').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=TRAVEL COMPANY').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Смета').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Чеклист').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Новая смета').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Мои сметы').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Файл').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Каталог услуг').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Регион:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Ushuaia').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=El Calafate').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Torres del Paine').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Bariloche').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Buenos Aires').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Mendoza').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Salta/Jujuy').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Все').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Трансфер').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Отели').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Гиды').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Активности').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Сервис').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=+ Услуга').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Расчет сметы').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=PAX:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Даты:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Заказчик:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Телефон:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Email:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=💬 Комментарии (не печатается)').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Описание программы (для печати)').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=+ Добавить услугу').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=🏨 Отели').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=+ Добавить отель').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Отели не добавлены').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=✈️ Перелёты').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=+ Добавить перелёт').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Перелёты не добавлены').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=📋 Прочие услуги').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=+ Добавить').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Прочие услуги не добавлены').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Опциональные услуги').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Услуги на выбор клиента (не входят в основную стоимость)').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=+ Добавить услугу').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Расчет стоимости').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Настройки ценообразования').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Скрытая наценка:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Комиссия партнера:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Себестоимость:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Наша прибыль:').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=ИТОГО КЛИЕНТУ').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Печать КП').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Email').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=Детализация услуг').first).to_be_visible(timeout=30000)
        await expect(frame.locator('text=v2.2.0').first).to_be_visible(timeout=30000)
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    