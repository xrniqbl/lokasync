// Founder panel UI test: login as admin → /admin tabs render; notification
// banner shows in the app and can be dismissed.
const { chromium } = require("playwright");

const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYW16Zm1yYnh6cXB3a3h3eWFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDc4ODAsImV4cCI6MjA5NjQ4Mzg4MH0.3v8rswnwM2FKtxhIPd6u_icczHB2GT-V9ibzlFOdWSY";
const BASE = "https://lhamzfmrbxzqpwkxwyah.supabase.co/functions/v1/server";

(async () => {
  // Get an admin token + send a test notification via API
  const login = await fetch(
    "https://lhamzfmrbxzqpwkxwyah.supabase.co/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "phase5.test@loka.dev",
        password: "Phase5Test!234",
      }),
    },
  ).then((r) => r.json());
  const token = login.access_token;
  const notif = await fetch(`${BASE}/admin/notifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "UI test broadcast",
      message: "This banner should appear in the app.",
      audience: "all",
    }),
  }).then((r) => r.json());
  console.log("sent notification:", notif.id);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:5199/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', "phase5.test@loka.dev");
  await page.fill('input[type="password"]', "Phase5Test!234");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/app/**", { timeout: 20000 });
  await page.waitForTimeout(2500);

  // Notification banner visible in the app?
  const banner = await page.getByText("UI test broadcast").count();
  console.log("notification banner visible:", banner > 0);
  await page.screenshot({ path: "C:/tmp/p11-app-banner.png" });
  if (banner > 0) {
    await page.getByLabel("Dismiss UI test broadcast").click();
    await page.waitForTimeout(800);
    console.log(
      "banner after dismiss:",
      await page.getByText("UI test broadcast").count(),
    );
  }

  // Founder panel
  await page.goto("http://localhost:5199/admin", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "C:/tmp/p11-admin-overview.png" });
  await page.getByRole("button", { name: "Vouchers" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "C:/tmp/p11-admin-vouchers.png" });
  await page.getByRole("button", { name: "Notifications" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "C:/tmp/p11-admin-notifications.png" });

  // Cleanup: delete the test notification
  await fetch(`${BASE}/admin/notifications/${notif.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("cleaned up notification");

  await browser.close();
  console.log("done");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
