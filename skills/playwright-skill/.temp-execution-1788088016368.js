const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await page.goto('https://j-materials.jp/ir/calendar/index.php', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    const images = await page.locator('img').evaluateAll((nodes) => nodes.map((node) => ({
      alt: node.alt,
      src: node.currentSrc || node.src,
      width: node.naturalWidth,
      height: node.naturalHeight,
    })));
    console.log(JSON.stringify(images.filter((image) => /calendar|schedule|ir|annual|year/i.test(`${image.alt} ${image.src}`))));
    await page.screenshot({ path: '/tmp/auto5-j-materials-page.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
