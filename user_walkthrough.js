
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const results = {};

    try {
        console.log('--- 🛡️ USER WALKTHROUGH START ---');
        await page.goto('http://localhost:3000/login');
        
        // Audit Login Screen
        results.loginScreen = {
            hasEmailField: await page.isVisible('input[type="email"]'),
            hasPasswordField: await page.isVisible('input[type="password"]'),
            title: await page.innerText('h4, h5, .title') || 'No Header Found'
        };

        // Perform Login
        await page.fill('input[type="email"]', 'admin@demo.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        
        // Wait for redirection
        await page.waitForURL('**/dashboard', { timeout: 5000 });
        results.authenticated = true;

        // Audit Dashboard View
        results.dashboard = {
            url: page.url(),
            hasBalance: (await page.innerText('body')).includes('KD') || (await page.innerText('body')).includes('Balance'),
            shipmentCountVisible: (await page.$$('tr')).length // Rows in dashboard table
        };

        console.log('AUDIT_RESULTS:', JSON.stringify(results, null, 2));
    } catch (err) {
        console.log('AUDIT_CRASHED:', err.message);
    }
    await browser.close();
})();
