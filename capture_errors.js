
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('RUNTIME_ERROR:', err.message));
    
    await page.goto('http://localhost:3000/login');
    await page.waitForTimeout(5000); 
    await browser.close();
})();
