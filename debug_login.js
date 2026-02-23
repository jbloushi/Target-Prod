
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    console.log('Navigating to Login for Debug...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    
    // Capture HTML to see if root div is empty
    const html = await page.content();
    fs.writeFileSync('/mnt/c/projects/Target-Prod/login_debug.html', html);
    
    // Capture Console Logs to find React Errors
    page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
    page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));
    
    await page.waitForTimeout(2000); // Give React a moment to crash
    await browser.close();
})();
