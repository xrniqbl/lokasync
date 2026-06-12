// Renders scripts/og-image.html to public/og-image.png (1200x630).
const path = require("path");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const file = path.resolve(__dirname, "og-image.html");
  await page.goto("file:///" + file.split(path.sep).join("/"));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve(__dirname, "../public/og-image.png") });
  await browser.close();
  console.log("og-image.png written");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
