const playwright = require('playwright');
const path = require('path');

async function run() {
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    const mockDate = process.argv[2] || '2026-02-06T12:00:00';
    const filePath = 'file://' + path.resolve('index.html');

    await page.goto(filePath);

    // Inject mock Date
    await page.evaluate((mockDateStr) => {
        const RealDate = Date;
        window.Date = class extends RealDate {
            constructor(...args) {
                if (args.length === 0) return new RealDate(mockDateStr);
                return new RealDate(...args);
            }
            static now() {
                return new RealDate(mockDateStr).getTime();
            }
        };
    }, mockDate);

    // Wait for JS to run and update UI
    await page.waitForTimeout(1000);

    await page.screenshot({ path: process.argv[3] || 'screenshot.png' });
    await browser.close();
}

run();
