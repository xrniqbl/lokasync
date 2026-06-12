// Scrolls through the landing page so reveal-on-scroll fires, then captures
// the testimonial + pricing/payment-badge sections and the footer.
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:5199/", { waitUntil: "networkidle" });
  // Walk down the page to trigger every IntersectionObserver reveal.
  await page.evaluate(async () => {
    const step = 600;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  await page.waitForTimeout(900);

  const fullH = await page.evaluate(() => document.body.scrollHeight);
  console.log("page height:", fullH);

  // Testimonials section (first <section> after features)
  const sections = page.locator("main > section");
  const count = await sections.count();
  console.log("sections:", count);
  await sections.nth(2).screenshot({ path: "/tmp/landing-testimonials.png" });
  await sections.nth(3).screenshot({ path: "/tmp/landing-pricing.png" });
  await page.locator("footer").screenshot({ path: "/tmp/landing-footer.png" });
  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
