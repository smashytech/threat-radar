// Renders scripts/social-card.html to site/social-card.png (1200×630), spec 009.
// Needs Playwright (pre-installed in the builder's workspace, not a project dependency).
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'social-card.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.card').screenshot({ path: path.join(__dirname, '..', 'site', 'social-card.png') });
  await browser.close();
  console.log('Wrote site/social-card.png');
})();
