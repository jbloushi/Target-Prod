
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    
    // 1. Go to Login
    console.log('Step 1: Navigating to Login...');
    await page.goto('http://localhost:3000/login');
    
    // 2. Auth
    console.log('Step 2: Filling Credentials...');
    await page.fill('input[type="email"]', 'admin@demo.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]'); // Assuming standard submit button
    
    // 3. Wait for Dashboard
    console.log('Step 3: Waiting for Dashboard...');
    try {
        await page.waitForURL('**/dashboard', { timeout: 10000 });
        await page.waitForSelector('table', { timeout: 5000 });
    } catch (e) {
        console.log('Navigation Timeout or Table not found');
    }

    // 4. Audit
    const html = await page.content();
    fs.writeFileSync('/mnt/c/projects/Target-Prod/ui_source_authenticated.html', html);
    
    const rows = await page.$$('tbody tr');
    
    console.log('REPORT_DATA:', JSON.stringify({
        currentUrl: page.url(),
        title: await page.title(),
        rowCount: rows.length,
        hasTable: (await page.$('table')) !== null,
        bodyTextSummary: (await page.innerText('body')).substring(0, 200).replace(/\n/g, ' ')
    }));
    
    await browser.close();
})();
