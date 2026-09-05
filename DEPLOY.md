# 🚀 Checklist Deploy ke Production — LokaSync

> Jalankan berurutan. Item 1–7 wajib sebelum buka akses ke pengguna.

## 1. Database (Supabase)

- [ ] Semua migration sudah diterapkan: `supabase db push` (atau jalankan
      combined script di `supabase/migrations/` bila memakai SQL editor).
- [ ] Verifikasi tabel inti ada: `plans`, `profiles`, `subscriptions`,
      `transactions`, `vouchers`, `workspaces`, `workspace_members`, `tasks`,
      `projects`, `system_config`, `kv_store_827698a1` (dipakai rate limiter,
      maintenance, dan 2FA).
- [ ] Backup otomatis aktif (Supabase paid plan → Database → Backups).

## 2. Secrets Edge Function

```bash
npx supabase secrets set \
  MIDTRANS_SERVER_KEY=... \
  MIDTRANS_CLIENT_KEY=... \
  MIDTRANS_IS_PRODUCTION=true \
  ADMIN_EMAILS=founder@domain.com \
  RESEND_API_KEY=re_... \
  INVITE_FROM_EMAIL="LokaSync <noreply@domain.com>"
```

- `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` di-inject Supabase otomatis.
- Lihat `.env.example` untuk penjelasan tiap variabel.
- Tanpa `RESEND_API_KEY`: invite/receipt/email OTP tidak terkirim (endpoint
  OTP mengembalikan 503). TOTP 2FA tetap berfungsi.

## 3. Deploy Edge Function

```bash
supabase functions deploy server
```

- [ ] Jalankan smoke test (langkah 7) — wajib hijau sebelum lanjut.

## 4. Environment Frontend (hosting: Vercel/Netlify/dll)

- [ ] `VITE_SUPABASE_PROJECT_ID` dan `VITE_SUPABASE_ANON_KEY` ter-set.
- [ ] Build command: `pnpm install && pnpm build` · Output: `dist`.
- [ ] SPA rewrite: semua route → `index.html` (Vercel/Netlify umumnya otomatis
      untuk Vite; pastikan refresh di `/login` tidak 404).
- [ ] Midtrans Snap di-handle di `PaymentStatusPage` — tidak perlu script
      tambahan di hosting.

## 5. SMTP Supabase Auth (email verifikasi & reset password)

- [ ] Project Settings → Authentication → SMTP: pasang SMTP kustom.
      Sender default Supabase dibatasi ketat (~2 email/jam di proyek baru) dan
      akan memblokir pendaftaran di produksi.
- [ ] Sesuaikan template email verifikasi/reset dengan branding.

## 6. Midtrans

- [ ] Sandbox dulu: `MIDTRANS_IS_PRODUCTION=false` + kunci sandbox; uji
      checkout penuh (termasuk `finish`/`pending`/`error` redirect).
- [ ] Webhook URL (Payment Notification) mengarah ke
      `https://<ref>.supabase.co/functions/v1/server/payments/webhook`.
- [ ] Produksi: ganti kunci live + `MIDTRANS_IS_PRODUCTION=true`, deploy ulang
      fungsi, smoke test ulang.

## 7. Smoke Test (black-box, tanpa kredensial)

```bash
node scripts/smoke-test.mjs https://<project-ref>.supabase.co
```

Memverifikasi: endpoint publik hidup, semua endpoint terproteksi menolak
pemanggil anonim (401/403), dan webhook menolak payload tak bertanda tangan.

## 8. Uji Manual End-to-End (akun nyata)

- [ ] Daftar → verifikasi email → onboarding
- [ ] Buat task & project → upload file → cek kuota
- [ ] Checkout paket (sandbox) → bayar → status berubah di polling
- [ ] Aktifkan 2FA (Settings → Two-Factor) → simpan kode cadangan → logout
- [ ] Login lagi → layar 2FA muncul → kode TOTP diterima → masuk
- [ ] Email OTP sebagai faktor kedua juga diuji (butuh `RESEND_API_KEY`)
- [ ] Toggle bahasa EN/ID di halaman publik dan dalam aplikasi

## 9. Operasional (disarankan segera setelah rilis)

- [ ] Error tracking (Sentry) — client + edge function.
- [ ] Uptime monitoring untuk `/functions/v1/server/health`.
- [ ] Review klaim trust badge di landing page ("SOC2 aligned",
      "GDPR compliant", "99.9% uptime SLA") — ganti bila belum bisa
      dipertanggungjawabkan.
- [ ] Perluas test coverage untuk alur kritis (checkout polling, 2FA).

## Rollback

- Frontend: redeploy commit sebelumnya di hosting.
- Edge function: `supabase functions deploy server` dari commit sebelumnya.
- Database: pulihkan dari backup (migrasi bersifat aditif; tidak ada down
  migration — uji dulu di project staging bila tersedia).
