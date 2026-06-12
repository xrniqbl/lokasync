// Phase-10 smoke test: signs in as the pro test user, then verifies
// (1) Teams loads (now requires the user JWT server-side),
// (2) Analytics loads,
// (3) Billing shows the "Renew now" button.
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console.error:", m.text().slice(0, 200));
  });

  await page.goto("http://localhost:5199/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "phase5.test@loka.dev");
  await page.fill('input[type="password"]', "Phase5Test!234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app/**", { timeout: 20000 });
  console.log("logged in:", page.url());

  await page.goto("http://localhost:5199/app/teams", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "C:/tmp/p10-teams.png" });

  await page.goto("http://localhost:5199/app/analytics", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "C:/tmp/p10-analytics.png" });

  await page.goto("http://localhost:5199/app/billing", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const renew = await page.getByText("Renew now").count();
  console.log("Renew now button count:", renew);
  await page.screenshot({ path: "C:/tmp/p10-billing.png" });

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
