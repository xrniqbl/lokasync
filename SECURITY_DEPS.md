# Keamanan Dependensi — LokaSync

Audit terakhir: 2026-10-15 (`pnpm audit`).

## Status

- **Kritis: 0** (ditutup via `react-router@7.18.2`, `vite@6.4.3`, overrides
  `tar/tinypool/nanoid/postcss/browserslist/source-map-js` di
  `pnpm-workspace.yaml`).
- **Sisa 9 (2 high, 5 moderate, 2 low):** semuanya alat pengembangan
  (`vite` dev-server, `vitest`, `launch-editor`) — tidak ikut ke bundle
  production (`dist/`). High yang tersisa adalah isu dev-server Vite
  (file-read / `server.fs.deny` bypass) yang tidak terekspos saat `vite build`
  maupun di hosting statis.

## Kebijakan

- Jalankan `pnpm audit` tiap sprint; kritis/high pada dependensi runtime
  (`react`, `react-router`, `@supabase/*`) wajib dipatch segera.
- Dev-only advisory (vite/vitest) dipatch saat update minor aman tersedia.
- Edge function memakai `supabase-js@2.49.8` (Deno JSR) — selaraskan ke
  versi frontend saat ada waktu pemeliharaan (perlu uji webhook + Auth API).
- Jangan `pnpm audit --fix` buta: cek CHANGELOG untuk breaking change dulu.
