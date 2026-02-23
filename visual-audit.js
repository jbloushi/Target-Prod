
const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log('Navigating to http://localhost:3000...');
    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
        console.log('Capturing Screenshot: landing_page.png');
        await page.screenshot({ path: 'landing_page.png' });
        
        console.log('Navigating to http://localhost:3000/login...');
        await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
        await page.screenshot({ path: 'login_page.png' });
        
        const content = await page.content();
        fs.writeFileSync('page_source.html', content);
        console.log('Visual Data Captured.');
    } catch (err) {
        console.error('Visual Capture Failed:', err.message);
    }
    
    await browser.close();
})();
