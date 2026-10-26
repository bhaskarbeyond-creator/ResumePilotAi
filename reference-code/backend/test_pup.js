
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        console.log('Testing Puppeteer launch...');
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process'
            ]
        });
        const page = await browser.newPage();
        await page.goto('https://airesume.projectdemo.guru/export/Cv1/test_doc_123/en', { waitUntil: 'networkidle0', timeout: 30000 });
        console.log('Puppeteer navigated! Title:', await page.title());
        await page.pdf({ path: '/tmp/puppeteer_test.pdf', format: 'A4', printBackground: true });
        console.log('Puppeteer PDF generated successfully!');
        await browser.close();
    } catch(e) {
        console.error('Puppeteer failed:', e.message);
    }
})();
