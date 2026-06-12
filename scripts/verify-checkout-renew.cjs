// Verifies the renewal note on /checkout/pro for a user with an active pro sub.
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:5199/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "phase5.test@loka.dev");
  await page.fill('input[type="password"]', "Phase5Test!234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app/**", { timeout: 20000 });
  await page.goto("http://localhost:5199/checkout/pro?interval=monthly", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(2500);
  const note = await page.getByText("Renewal: your new period starts after").count();
  console.log("renewal note count:", note);
  await page.screenshot({ path: "C:/tmp/p10-checkout.png", fullPage: true });
  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
