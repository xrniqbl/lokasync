/**
 * smoke-test.mjs — black-box check of a DEPLOYED edge function.
 *
 * Verifies the security posture and liveness of the running `server` function
 * without any credentials: public endpoints respond, protected endpoints reject
 * anonymous callers, and the Midtrans webhook refuses unsigned payloads.
 *
 * Usage:
 *   node scripts/smoke-test.mjs                          # uses env / .env.local
 *   node scripts/smoke-test.mjs https://<ref>.supabase.co
 *
 * Resolves the project URL from (in order): argv, SUPABASE_URL,
 * VITE_SUPABASE_URL, VITE_SUPABASE_PROJECT_ID (env or .env.local).
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv(file) {
  const vars = {};
  if (!existsSync(file)) return vars;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...loadEnv(join(root, ".env.local")), ...process.env };

const base = (() => {
  const arg = process.argv[2];
  if (arg) return arg.replace(/\/$/, "") + "/functions/v1/server";
  if (env.SUPABASE_URL) return env.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/server";
  if (env.VITE_SUPABASE_URL) return env.VITE_SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/server";
  const ref = env.VITE_SUPABASE_PROJECT_ID;
  if (ref) return `https://${ref}.supabase.co/functions/v1/server`;
  console.error("No project URL. Pass it as an argument or set VITE_SUPABASE_PROJECT_ID.");
  process.exit(2);
})();

const jsonInit = { "Content-Type": "application/json" };
const checks = [
  { name: "GET /health is public and alive", path: "/health", expect: (r, b) => r.status === 200 && b?.status === "ok" },
  { name: "GET /status is public (maintenance flag)", path: "/status", expect: (r, b) => r.status === 200 && typeof b?.maintenance === "object" },
  { name: "GET /plans is public", path: "/plans", expect: (r) => r.status === 200 },
  { name: "GET /profile rejects anonymous callers", path: "/profile", expect: (r) => r.status === 401 },
  { name: "GET /tasks rejects anonymous callers (workspace gate)", path: "/tasks", expect: (r) => r.status === 401 },
  { name: "GET /2fa/setup rejects anonymous callers", path: "/2fa/setup", expect: (r) => r.status === 401 },
  { name: "POST /2fa/verify-login rejects anonymous callers", path: "/2fa/verify-login", init: { method: "POST", headers: jsonInit, body: JSON.stringify({ code: "000000" }) }, expect: (r) => r.status === 401 },
  { name: "GET /payments/status rejects anonymous callers", path: "/payments/status/smoke-test", expect: (r) => r.status === 401 },
  { name: "GET /admin/overview rejects non-admins", path: "/admin/overview", expect: (r) => r.status === 401 || r.status === 403 },
  {
    name: "POST /payments/webhook refuses unsigned payloads",
    path: "/payments/webhook",
    init: { method: "POST", headers: jsonInit, body: JSON.stringify({ order_id: "smoke-test", status_code: "200", gross_amount: "100.00", signature_key: "deadbeef" }) },
    expect: (r) => r.status === 400 || r.status === 403 || r.status === 404,
  },
];

let failed = 0;
for (const { name, path, init, expect } of checks) {
  try {
    const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(15000) });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON is fine */ }
    const ok = expect(res, body);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${res.status})`);
    if (!ok) failed++;
  } catch (e) {
    const cause = e.cause?.code ?? "";
    let hint = e.name === "TimeoutError" ? "timeout" : e.message;
    if (cause === "ENOTFOUND") {
      hint = `DNS could not resolve the project host — the Supabase project may be paused/deleted, or VITE_SUPABASE_PROJECT_ID is wrong (${e.cause?.hostname ?? ""})`;
    }
    console.log(`FAIL  ${name}  (${hint})`);
    failed++;
  }
}

console.log(failed === 0 ? `\nAll ${checks.length} checks passed against ${base}` : `\n${failed}/${checks.length} checks FAILED against ${base}`);
process.exit(failed === 0 ? 0 : 1);
