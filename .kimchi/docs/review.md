# Review: Fase 12 + 13

## Verdict: NEEDS_FIXES

## Issues

1. **File: `src/app/pages/AdminPage.tsx`** Line 47 — `MailWarning` is referenced in the `TABS` array but is **not imported** from `lucide-react`. The existing imports only include `ArrowLeft`, `BellRing`, `Database`, `LayoutDashboard`, `Ticket`, `Trash2`, `Users`, and `Wrench`. This will cause a compile-time ReferenceError.
   — Suggested fix: Add `MailWarning` to the `lucide-react` import list: `import { ..., MailWarning } from "lucide-react";`

2. **File: `src/app/components/FilesPage.tsx`** Line 210 & Line 261 — The file list and grid views render `file.size` (raw bytes, e.g. `2516582`) instead of `file.sizeHuman` (human-readable, e.g. `"2.4 MB"`). Since `FileItem.size` was changed from a display string to a `number` (bytes), the UI now shows unreadable byte counts to users.
   — Suggested fix: Change `{file.size}` to `{file.sizeHuman}` in both the list view column (line ~210, `<div className="text-neutral-500...">{file.size}</div>`) and the grid view metadata (line ~261, `{file.size} · {file.modified}`).

3. **File: `supabase/functions/server/index.tsx`** Line 36 — The CORS `allowHeaders` array does not include `"X-Workspace-Id"`, but the frontend sends this header on every request. Without it, browsers will reject the CORS preflight for workspace-scoped routes.
   — Suggested fix: Add `"X-Workspace-Id"` to the `allowHeaders` array in the `cors()` middleware configuration.

4. **File: `supabase/functions/server/index.tsx`** Lines ~260–273 (SEED_FILES) — Seed file entries have `storagePath: null` but are **missing** the `url` and `urlExpiresAt` fields that the `FileItem` type now requires (`url: string | null; urlExpiresAt: string | null`). This causes a type mismatch between seed data and the `FileItem` interface.
   — Suggested fix: Add `url: null` and `urlExpiresAt: null` to every item in `SEED_FILES`.

## Fase 12 Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | `FileItem.size` is `number` (bytes) on both server and client | PASS |
| 2 | `FileItem.sizeHuman` is `string` for display | PASS |
| 3 | `POST /files/upload` checks quota BEFORE uploading to Storage | PASS |
| 4 | `DELETE /files/:name` deletes from Storage bucket AND decrements usage | PASS |
| 5 | `request()` does NOT set `Content-Type: application/json` when body is `FormData` | PASS |
| 6 | UploadModal shows file size and handles 413 (quota exceeded) | PASS |
| 7 | FilesPage download opens signed URL in new tab | PASS |
| 8 | SettingsPage shows real storage usage | PASS |

## Fase 13 Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | `sendEmail()` from `emails.tsx` is used by both receipt and invitation (DRY) | PASS |
| 2 | Receipt email is sent inside `applyTransactionStatus()` AFTER subscription is saved | PASS |
| 3 | Email failure is caught and logged, never thrown (does not break transaction) | PASS |
| 4 | `POST /admin/send-reminders` is gated by admin auth | PASS |
| 5 | `subscriptions:active` list is maintained when subscriptions are activated | PASS |
| 6 | AdminPage calls the correct API endpoint | PASS |

## Notes

- **Spec compliance**: The implementation closely follows the plan. All major endpoints (`/files/upload`, `/files/download/:name`, `/files/quota`, `/admin/send-reminders`) are present and wired correctly.
- **Type consistency**: `FileItem` and `QuotaInfo` types match between server and client. The `FileItem` returned by `POST /files/upload` includes all required fields (`size`, `sizeHuman`, `storagePath`, `url`, `urlExpiresAt`).
- **Error handling**: UploadModal catches 413 (quota exceeded) and shows a user-friendly toast. The server returns descriptive error messages for missing files, empty files, and storage misconfiguration.
- **Security**: The admin reminder endpoint (`POST /admin/send-reminders`) is properly gated via `requireAdmin()`, which checks both authentication and the `ADMIN_EMAILS` allowlist. File deletion is workspace-scoped via `wsKey()` and the workspace gate middleware.
- **Edge cases**: Empty files (size === 0) are rejected with a 400. Email failure is wrapped in a `try/catch` so it never breaks the payment transaction flow. File deletion gracefully handles legacy seed data that lacks `storagePath`.
- **Integration**: Frontend API calls match server endpoints exactly. The `uploadFile()` helper correctly sends `FormData` without overriding `Content-Type`, letting the browser set the multipart boundary automatically.
- **CORS concern**: The missing `"X-Workspace-Id"` in `allowHeaders` is the most impactful runtime issue — it could silently break all workspace-scoped uploads/downloads in production.
- **FilesPage display**: The `file.size` vs `file.sizeHuman` display issue is a clear UX regression from the type change.
- **kv_store.tsx**: The `list()` function was added and is available, though the reminder endpoint uses the `subscriptions:active` array approach (more efficient) rather than scanning all keys.
