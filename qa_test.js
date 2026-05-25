const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5174/');
  const title = await page.title();
  console.log('Page title:', title);
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Body text snippet:', text.substring(0, 300));
  await browser.close();
})();
