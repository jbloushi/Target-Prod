
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    console.log('Navigating...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Capture HTML
    const html = await page.content();
    fs.writeFileSync('/mnt/c/projects/Target-Prod/ui_source.html', html);
    
    // specific element checks
    const hasTable = await page.$('table');
    const hasSkeletons = await page.$('[class*="SkeletonBox"]'); // Checking for my new component
    const hasRows = await page.$$('tbody tr');
    
    console.log('REPORT_DATA:', JSON.stringify({
        title: await page.title(),
        hasTable: !!hasTable,
        rowCount: hasRows.length,
        hasSkeletons: !!hasSkeletons, // Should be false if data loaded, true if loading
        url: page.url()
    }));
    
    await browser.close();
})();
