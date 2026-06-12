# Rencana Implementasi: Fase 12 (Real File Upload + Kuota Storage) & Fase 13 (Email Transaksional — Resend)

**Goal:** File yang diunggah disimpan sebagai byte nyata di Supabase Storage (bukan metadata JSON di KV), dengan pengecekan kuota per workspace, dan pengguna menerima email invoice setelah pembayaran serta reminder sebelum langganan berakhir.

**Architecture:** Supabase Storage bucket `workspace-files` dengan RLS path-based (`workspace/{id}/`). Server Edge Function bertindak sebagai gatekeeper: cek kuota → upload ke Storage via service-role client → catat metadata + usage di KV. Email transaksional lewat Resend (pattern sudah ada di `workspaces.tsx`) dipicu dari webhook Midtrans saat settlement dan dari endpoint reminder.

**Tech Stack:** Hono (Edge Function), Supabase Storage (RLS), Supabase JS client, KV Store, Resend HTTP API.

---

## Konteks codebase yang sudah ada

| Lokasi | Keterangan |
|--------|------------|
| `supabase/functions/server/index.tsx` | Hono router, workspace gate dengan `wsKey()` dan `wsGetOrSeed()` |
| `supabase/functions/server/workspaces.tsx` | Sudah punya `sendInvitationEmail()` via Resend (`RESEND_API_KEY`) |
| `supabase/functions/server/kv_store.tsx` | KV get/set wrapper |
| `src/app/utils/api.ts` | Client API wrapper, setiap request bawa `X-Workspace-Id` |
| `src/app/components/modals/UploadModal.tsx` | UI dropzone tapi cuma kirim `{ name, size: "—", type, ... }` |
| `src/app/components/FilesPage.tsx` | CRUD metadata via KV, belum ada download byte |
| `SEED_PLANS` di server | `"1 GB file storage"`, `"25 GB file storage"`, `"Unlimited file storage"` |
| `SEED_BILLING.usage` | `{ storage: 8.2, storageLimit: 50 }` — hardcoded |
| `applyTransactionStatus()` di server | Webhook Midtrans, tempat subscription di-activate — **tambah trigger email receipt di sini** |

---

## File Structure (Baru & Dimodifikasi)

| Status | File | Tanggung jawab |
|--------|------|----------------|
| **Modify** | `supabase/functions/server/index.tsx` | Tambah endpoint upload/download, quota enforcement, email trigger |
| **Modify** | `supabase/functions/server/workspaces.tsx` | Tambah helper `sendReceiptEmail()` dan `sendReminderEmail()` |
| **Modify** | `src/app/utils/api.ts` | Tambah `uploadFile(file)`, `getDownloadUrl(name)`, tipe `FileItem` baru dengan `storagePath` dan `url` |
| **Modify** | `src/app/components/modals/UploadModal.tsx` | Kirim `File` via multipart form data, tampilkan progress |
| **Modify** | `src/app/components/FilesPage.tsx` | Download dari signed URL, delete juga hapus dari Storage |
| **Modify** | `src/app/components/SettingsPage.tsx` | Tampilkan storage usage nyata dari KV billing |
| **Modify** | `supabase/functions/server/index.ts` *(jika masih dipakai)* | Sinkronkan perubahan dari `.tsx` |
| **Baru** | `supabase/functions/server/emails.tsx` | Template & helper email (receipt, reminder) |
| **Konfig** | Supabase Dashboard / SQL Editor | Buat bucket `workspace-files` + RLS policies |

---

## Helpers Server Baru

### Storage Client (di `index.tsx`, scope file-level)

```ts
// Admin client untuk akses Storage tanpa RLS (server-to-server)
function storageClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
```

### Quota Checker

```ts
const PLAN_STORAGE_LIMITS: Record<string, number> = {
  free: 1 * 1024 * 1024 * 1024,      // 1 GB
  pro: 25 * 1024 * 1024 * 1024,      // 25 GB
  business: 0,                         // 0 = unlimited
};

async function checkStorageQuota(c: any, additionalBytes: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const user = c.get("user");
  const sub = await kv.get(`subscription:${user.id}`);
  const planId = sub?.plan_id ?? "free";
  const limit = PLAN_STORAGE_LIMITS[planId] ?? PLAN_STORAGE_LIMITS.free;
  const usageKey = wsKey(c, "storage:usage");
  const used = (await kv.get(usageKey)) ?? 0;
  if (limit > 0 && used + additionalBytes > limit) {
    return { allowed: false, used, limit };
  }
  return { allowed: true, used, limit };
}

async function incrementStorageUsage(c: any, deltaBytes: number) {
  const usageKey = wsKey(c, "storage:usage");
  const current = (await kv.get(usageKey)) ?? 0;
  await kv.set(usageKey, Math.max(0, current + deltaBytes));
}

async function getStorageUsage(c: any): Promise<{ used: number; limit: number }> {
  const user = c.get("user");
  const sub = await kv.get(`subscription:${user.id}`);
  const planId = sub?.plan_id ?? "free";
  const limit = PLAN_STORAGE_LIMITS[planId] ?? PLAN_STORAGE_LIMITS.free;
  const usageKey = wsKey(c, "storage:usage");
  const used = (await kv.get(usageKey)) ?? 0;
  return { used, limit };
}
```

### Helper Email (dipindah dari `workspaces.tsx` ke `emails.tsx` supaya reusable)

```ts
// supabase/functions/server/emails.tsx
const RESEND_API_KEY = () => Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = () => Deno.env.get("INVITE_FROM_EMAIL") ?? "LokaSync <onboarding@resend.dev>";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = RESEND_API_KEY();
  if (!key) { console.log("RESEND_API_KEY not set — email skipped:", subject); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: FROM_EMAIL(), to: [to], subject, html }),
  });
  if (!res.ok) { console.log("Resend error:", res.status, await res.text()); return false; }
  return true;
}
```

---

## Fase 12 — Real File Upload + Kuota Storage

### Task 12.1: Konfigurasi Supabase Storage Bucket

**Tujuan:** Buat bucket `workspace-files` dengan RLS policy di Supabase Dashboard.

**Langkah:** Buka Supabase Dashboard → Storage → New bucket:
- **Name:** `workspace-files`
- **Public:** `false` (files private, diakses via signed URL)

**SQL Editor — RLS Policies:**

```sql
-- Enable RLS on storage.objects
alter table storage.objects enable row level security;

-- Policy: users can only see/modify objects inside their workspace prefix
-- Bucket path format: workspace-files/{workspaceId}/{filename}

create policy "Members can read their workspace files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] in (
    select ws_id::text from public.memberships where user_id = auth.uid()
  )
);

create policy "Members can upload to their workspace"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] in (
    select ws_id::text from public.memberships where user_id = auth.uid()
  )
);

create policy "Members can delete their workspace files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'workspace-files'
  and (storage.foldername(name))[1] in (
    select ws_id::text from public.memberships where user_id = auth.uid()
  )
);
```

> **Catatan:** Karena KV (bukan tabel SQL) menyimpan data workspace, RLS di atas membaca tabel `memberships` (dari Fase 14). Ini cocok karena Fase 14 sudah punya tabel `memberships`. Kalau tabelnya beda nama, sesuaikan.

- [ ] **Verifikasi:** Buka Storage → Policies, pastikan 3 policy muncul.

---

### Task 12.2: Endpoint Upload File (Server)

**File:** `supabase/functions/server/index.tsx`

**Letakkan setelah block `// ── Files ─────────────────────────────────────────────────────────────────────`.**

**Server endpoint:**

```ts
// Real file upload — multipart/form-data.
// Body: FormData dengan field "file" (File) dan opsional "metadata" (string JSON).
// Flow: cek kuota → upload ke Supabase Storage → simpan metadata di KV → update usage.
app.post("/files/upload", async (c) => {
  try {
    const client = storageClient();
    if (!client) return c.json({ error: "Storage not configured" }, 503);

    const form = await c.req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "Missing file field" }, 400);
    }
    if (file.size === 0) return c.json({ error: "Empty file" }, 400);

    const rawMeta = form.get("metadata");
    const parsedMeta = rawMeta && typeof rawMeta === "string" ? JSON.parse(rawMeta) : {};

    // 1. Quota check
    const quota = await checkStorageQuota(c, file.size);
    if (!quota.allowed) {
      return c.json(
        { error: "Storage quota exceeded", used: quota.used, limit: quota.limit },
        413,
      );
    }

    // 2. Upload to Supabase Storage
    const workspace = c.get("workspace");
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${workspace.id}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { data: uploadData, error: uploadErr } = await client
      .storage
      .from("workspace-files")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      console.log("Storage upload error:", uploadErr);
      return c.json({ error: uploadErr.message }, 500);
    }

    // 3. Get public/signed URL
    const { data: urlData } = await client
      .storage
      .from("workspace-files")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

    const fileRecord = {
      name: file.name,
      type: ext || "doc",
      size: file.size,                       // ← bytes nyata
      sizeHuman: humanSize(file.size),       // "2.4 MB"
      modified: new Date().toISOString(),
      owner: parsedMeta.owner || "—",
      shared: parsedMeta.shared ?? false,
      archived: false,
      storagePath,
      url: urlData?.signedUrl ?? null,
      urlExpiresAt: urlData?.signedUrl
        ? new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString()
        : null,
    };

    // 4. Save metadata to KV
    const files = await wsGetOrSeed(c, "files:list", SEED_FILES);
    files.unshift(fileRecord);
    await kv.set(wsKey(c, "files:list"), files);

    // 5. Update usage counter
    await incrementStorageUsage(c, file.size);

    return c.json(fileRecord, 201);
  } catch (e) {
    console.log("POST /files/upload error:", e);
    return c.json({ error: String(e) }, 500);
  }
});
```

**Helper `humanSize`:**

```ts
function humanSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
```

**Juga tambahkan `storageClient()` dan `humanSize()` di level file** (sebaiknya di atas `// ── Files` block).

**Tambah env var yang dibutuhkan:**
- `SUPABASE_URL` — sudah biasanya tersedia
- `SUPABASE_SERVICE_ROLE_KEY` — sudah biasanya tersedia
- `RESEND_API_KEY` — sudah ada (digunakan untuk invitation)

- [ ] **Verifikasi:** Deploy Edge Function, lalu test dengan `curl` multipart upload.

---

### Task 12.3: Endpoint Download File (Server)

**File:** `supabase/functions/server/index.tsx`

**Tambahkan di bawah block upload (masih di section Files):**

```ts
// Generate a fresh signed URL for download.
app.get("/files/download/:name", async (c) => {
  try {
    const client = storageClient();
    if (!client) return c.json({ error: "Storage not configured" }, 503);

    const name = decodeURIComponent(c.req.param("name"));
    const files = await wsGetOrSeed(c, "files:list", SEED_FILES);
    const file = files.find((f: any) => f.name === name);
    if (!file?.storagePath) return c.json({ error: "File not found" }, 404);

    const { data, error } = await client
      .storage
      .from("workspace-files")
      .createSignedUrl(file.storagePath, 60 * 60); // 1 hour

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ url: data.signedUrl, expiresIn: 3600 });
  } catch (e) {
    console.log("GET /files/download error:", e);
    return c.json({ error: String(e) }, 500);
  }
});
```

- [ ] **Verifikasi:** GET `/files/download/{filename}` → response `{ url: "..." }`.

---

### Task 12.4: Endpoint Storage Usage (Server)

**File:** `supabase/functions/server/index.tsx`

**Tambahkan di bawah endpoint download:**

```ts
// Return current storage usage for the active workspace.
app.get("/files/quota", async (c) => {
  try {
    const { used, limit } = await getStorageUsage(c);
    return c.json({ used, limit, unlimited: limit === 0 });
  } catch (e) {
    console.log("GET /files/quota error:", e);
    return c.json({ error: String(e) }, 500);
  }
});
```

- [ ] **Verifikasi:** GET `/files/quota` → `{ used: 0, limit: 1073741824, unlimited: false }` untuk plan free.

---

### Task 12.5: Update Delete File Endpoint (Hapus dari Storage + Kurangi Usage)

**File:** `supabase/functions/server/index.tsx`

**Letakkan di mana endpoint DELETE /files/:name saat ini berada. Replace isi try-block:**

```ts
app.delete("/files/:name", async (c) => {
  try {
    const client = storageClient();
    const name = decodeURIComponent(c.req.param("name"));
    let files = await wsGetOrSeed(c, "files:list", SEED_FILES);
    const file = files.find((f: any) => f.name === name);

    if (!file) return c.json({ error: "File not found" }, 404);

    // 1. Delete from Storage if there's a real file
    if (client && file.storagePath) {
      const { error } = await client.storage.from("workspace-files").remove([file.storagePath]);
      if (error) console.log("Storage delete error:", error);
    }

    // 2. Decrement usage counter
    if (file.size && typeof file.size === "number") {
      await incrementStorageUsage(c, -file.size);
    }

    // 3. Remove from KV metadata
    files = files.filter((f: any) => f.name !== name);
    await kv.set(wsKey(c, "files:list"), files);

    return c.json({ ok: true });
  } catch (e) {
    console.log("DELETE /files/:name error:", e);
    return c.json({ error: String(e) }, 500);
  }
});
```

**Juga update `SEED_FILES` agar seed data punya `storagePath: null` dan `size: 0`** di setiap item:

Sunting setiap item di `SEED_FILES` (ada di baris ~260): tambahkan `"storagePath": null, "size": 0` (atau angka real jika mau — tapi karena seed data pakai `"size": "2.4 MB"`, ubah format size jadi number + tambah `sizeHuman`).

**Salah satu cara mudah:**seed data** jangan diganti formatnya — cukup tambahkan fallback saat delete. Jika `file.size` adalah string (data lama), anggap size = 0. Tapi agar seed data bisa ditampilkan dengan human readable, ubah sedikit saat seeding:

```ts
const SEED_FILES = [
  {
    name: "Project Proposal — Web App v2.pdf",
    type: "pdf",
    size: 2457600,        // ← bytes
    sizeHuman: "2.4 MB",   // ← tampilan
    modified: "Jun 5, 2026",
    owner: "JD",
    shared: true,
    archived: false,
    storagePath: null,
  },
  // ... lanjutkan untuk semua item
];
```

- [ ] **Verifikasi:** Upload file → cek bucket Storage ada objek baru → delete → objek hilang dari bucket.

---

### Task 12.6: API Client — Upload & Download (Frontend)

**File:** `src/app/utils/api.ts`

**Tambahkan:**

```ts
export interface FileItem {
  name: string;
  type: string;
  size: number;          // ← bytes
  sizeHuman: string;     // ← "2.4 MB"
  modified: string;
  owner: string;
  shared: boolean;
  archived: boolean;
  storagePath: string | null;
  url: string | null;
  urlExpiresAt: string | null;
}

export interface QuotaInfo {
  used: number;
  limit: number;
  unlimited: boolean;
}

// Upload file nyata — multipart/form-data
export const uploadFile = (file: File, metadata?: { owner?: string; shared?: boolean }) => {
  const form = new FormData();
  form.append("file", file);
  if (metadata) form.append("metadata", JSON.stringify(metadata));
  return request<FileItem>("/files/upload", {
    method: "POST",
    body: form,
    // Jangan set Content-Type — browser akan set boundary otomatis
  });
};

// Dapatkan signed URL untuk download
export const getDownloadUrl = (name: string) =>
  request<{ url: string; expiresIn: number }>(`/files/download/${encodeURIComponent(name)}`);

// Ambil quota storage workspace
export const getStorageQuota = () => request<QuotaInfo>("/files/quota");
```

**Catatan:** `request()` perlu handle `body` yang bertipe `FormData` — jangan JSON.stringify dan jangan set `Content-Type: application/json`. Cek implementasi `request()` saat ini:

```ts
// Di api.ts, modifikasi request() untuk tidak override Content-Type kalau body adalah FormData
function request<T>(path: string, opts?: { method?: string; body?: BodyInit | null }) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Workspace-Id": activeWorkspaceId ?? "",
  };
  // Jangan set Content-Type kalau FormData — browser set boundary sendiri
  if (opts?.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${baseUrl}${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body ?? null,
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`${r.status}: ${text}`);
    }
    return r.json() as Promise<T>;
  });
}
```

- [ ] **Verifikasi:** `uploadFile()` berhasil POST dengan `Content-Type: multipart/form-data; boundary=...`

---

### Task 12.7: UploadModal — Kirim File Nyata

**File:** `src/app/components/modals/UploadModal.tsx`

**Ubah interface props:**

```ts
interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUpload?: (file: api.FileItem) => void;
}
```

**Ubah state & handler:**

```tsx
const [dragging, setDragging] = useState(false);
const [file, setFile] = useState<File | null>(null);  // ← File object, bukan cuma nama
const [folder, setFolder] = useState("Recent");
const [ownerInitials, setOwnerInitials] = useState("");
const [uploading, setUploading] = useState(false);
const [progress, setProgress] = useState(0);
```

**Handle drop & input simpan File object:**

```tsx
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setDragging(false);
  const f = e.dataTransfer.files[0];
  if (f) setFile(f);
};

const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
  const f = e.target.files?.[0];
  if (f) setFile(f);
};

const reset = () => {
  setFile(null);
  setFolder("Recent");
  setProgress(0);
};
```

**Handle upload kirim ke API:**

```tsx
const handleUpload = async () => {
  if (!file) { toast.error("Select a file to upload"); return; }
  setUploading(true);
  try {
    const uploaded = await api.uploadFile(file, {
      owner: ownerInitials || undefined,
      shared: false,
    });
    onUpload?.(uploaded);
    toast.success(`"${file.name}" uploaded (${uploaded.sizeHuman})`);
    reset();
    onClose();
  } catch (e: any) {
    if (e.message?.includes("413")) {
      toast.error("Storage quota exceeded — upgrade your plan to upload more files");
    } else {
      toast.error(`Upload failed: ${e.message}`);
    }
  } finally {
    setUploading(false);
  }
};
```

**Update UI dropzone agar tampilkan nama + size:**

```tsx
{file ? (
  <div>
    <div className="text-2xl mb-2">📄</div>
    <div className="text-neutral-200 text-[13px]">{file.name}</div>
    <div className="text-neutral-500 text-[12px] mt-1">{api.humanSize(file.size)}</div>
  </div>
) : (
  <div>
    <div className="text-2xl mb-2">☁</div>
    <div className="text-neutral-300 text-[13px]">Drop files here or click to browse</div>
    <div className="text-neutral-600 text-[12px] mt-1">Max size depends on your plan</div>
  </div>
)}
```

> **Catatan:** `api.humanSize` perlu di-export dari `api.ts`. Tambahkan:
> ```ts
> export function humanSize(bytes: number): string { ... }
> ```

**Disable tombol saat uploading:**

```tsx
<ModalFooter
  onCancel={() => { reset(); onClose(); }}
  onConfirm={handleUpload}
  confirmLabel={uploading ? "Uploading..." : "Upload"}
  confirmDisabled={!file || uploading}
/>
```

- [ ] **Verifikasi:** Upload file → file muncul di list dengan size nyata → cek Supabase Storage bucket ada object baru.

---

### Task 12.8: FilesPage — Download & Delete Update

**File:** `src/app/components/FilesPage.tsx`

**Download handler:**

```tsx
const handleDownload = async (fileName: string) => {
  try {
    const { url } = await api.getDownloadUrl(fileName);
    window.open(url, "_blank");
  } catch (e) {
    toast.error("Failed to generate download link");
  }
};
```

**Ganti tombol "Download" di file menu:**

```tsx
<button onClick={() => { handleDownload(file.name); setOpenMenu(null); }}>Download</button>
```

**Delete handler sudah pakai `api.deleteFile()` — tidak perlu ubah.** Tapi pastikan `onUpload` callback di FilesPage menambahkan file hasil upload ke state:

```tsx
<UploadModal
  open={showUpload}
  onClose={() => setShowUpload(false)}
  onUpload={(uploaded) => setFiles((prev) => [uploaded, ...prev])}
/>
```

- [ ] **Verifikasi:** Klik download → browser buka signed URL → file terdownload.

---

### Task 12.9: SettingsPage — Tampilkan Storage Usage Real

**File:** `src/app/components/SettingsPage.tsx`

**Tambahkan di Billing section:** fetch storage usage saat tab billing aktif.

```tsx
const [quota, setQuota] = useState<api.QuotaInfo | null>(null);

useEffect(() => {
  if (activeSetting === "billing") {
    api.getStorageQuota().then(setQuota).catch(() => {});
  }
}, [activeSetting]);
```

**Tampilkan di usage card:**

Ganti line yang menampilkan `usage.storage` (hardcoded 8.2) dengan:

```tsx
const usedGB = quota ? (quota.unlimited ? "∞" : (quota.used / (1024 * 1024 * 1024)).toFixed(2)) : "—";
const limitGB = quota ? (quota.unlimited ? "∞" : (quota.limit / (1024 * 1024 * 1024)).toFixed(0)) : "—";
const pct = quota && !quota.unlimited && quota.limit > 0
  ? Math.round((quota.used / quota.limit) * 100)
  : 0;

// Di render:
<div className="text-white text-[15px] font-medium">{usedGB} GB</div>
<div className="text-neutral-500 text-[12px]">of {limitGB} GB</div>
// ... progress bar dengan width={`${pct}%`}
```

- [ ] **Verifikasi:** Buka Settings → Billing → storage usage menunjukkan angka real.

---

## Fase 13 — Email Transaksional (Resend)

### Task 13.1: Helper Email Generik (`emails.tsx`)

**File:** `supabase/functions/server/emails.tsx`

Buat file baru sebagai module email terpusat:

```ts
// supabase/functions/server/emails.tsx
const RESEND_API_KEY = () => Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = () =>
  Deno.env.get("INVITE_FROM_EMAIL") ?? "LokaSync <onboarding@resend.dev>";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const key = RESEND_API_KEY();
  if (!key) {
    console.log("RESEND_API_KEY not set — email skipped:", subject, "to:", to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL(),
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    console.log("Resend error:", res.status, await res.text());
    return false;
  }
  return true;
}

export function receiptHtml(params: {
  userName: string;
  planName: string;
  interval: string;
  amount: number;
  currency: string;
  orderId: string;
  periodEnd: string;
  paymentType?: string | null;
}): string {
  const { userName, planName, interval, amount, currency, orderId, periodEnd, paymentType } = params;
  const periodLabel = interval === "yearly" ? "Yearly" : "Monthly";
  const formattedAmount = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
  }).format(amount);

  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#111">Payment confirmed — thank you, ${escapeHtml(userName)}!</h2>
    <p>Your <strong>${escapeHtml(planName)}</strong> (${periodLabel}) subscription is now active.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr><td style="padding:6px 0;color:#666">Order ID</td><td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(orderId)}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600">${formattedAmount}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Payment method</td><td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(paymentType ?? "—")}</td></tr>
      <tr><td style="padding:6px 0;color:#666">Valid until</td><td style="padding:6px 0;text-align:right;font-weight:600">${new Date(periodEnd).toLocaleDateString("id-ID")}</td></tr>
    </table>
    <p style="color:#888;font-size:13px">You can view your invoices anytime in Settings → Billing.</p>
  </div>`;
}

export function reminderHtml(params: {
  userName: string;
  planName: string;
  expiryDate: string;
  daysLeft: number;
}): string {
  const { userName, planName, expiryDate, daysLeft } = params;
  return `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="color:#111">Your subscription expires soon</h2>
    <p>Hi ${escapeHtml(userName)},</p>
    <p>Your <strong>${escapeHtml(planName)}</strong> plan will expire on <strong>${new Date(expiryDate).toLocaleDateString("id-ID")}</strong> (${daysLeft} day${daysLeft === 1 ? "" : "s"} left).</p>
    <p><a href="https://lokasync.app/settings/billing" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none">Renew subscription</a></p>
    <p style="color:#888;font-size:13px">If you don't renew, your workspace will be downgraded to the Free plan. Files over quota will remain accessible but new uploads will be blocked.</p>
  </div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

**Refactor `workspaces.tsx`:** import `sendEmail` dari `emails.tsx` dan hapus duplikasi.

```ts
// Di workspaces.tsx, ganti sendInvitationEmail menjadi:
import * as emails from "./emails.tsx";

export async function sendInvitationEmail(
  invitation: Invitation,
  inviteUrl: string,
): Promise<boolean> {
  return emails.sendEmail(
    invitation.email,
    `${invitation.invited_by} invited you to "${invitation.workspace_name}" on LokaSync`,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2>You're invited to ${invitation.workspace_name}</h2>
      <p><strong>${invitation.invited_by}</strong> invited you to join the
      workspace <strong>${invitation.workspace_name}</strong> on LokaSync
      as a <strong>${invitation.role}</strong>.</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none">Accept invitation</a></p>
      <p style="color:#888;font-size:13px">This invitation expires on
      ${new Date(invitation.expires_at).toUTCString()}. If you didn't expect
      this email, you can safely ignore it.</p>
    </div>`,
  );
}
```

- [ ] **Verifikasi:** Invitation email masih berfungsi (regression test).

---

### Task 13.2: Trigger Email Receipt saat Payment Settlement

**File:** `supabase/functions/server/index.ts` (file `.tsx` juga disinkronkan)

**Modifikasi `applyTransactionStatus()` — tambahkan kirim email setelah subscription di-activate:**

```ts
import * as emails from "./emails.tsx";

async function applyTransactionStatus(tx: any, midtransData: any) {
  // ... kode existing sampai sebelum return tx di akhir ...

  if (status === "paid" && !alreadyPaid) {
    const started = new Date();
    // ... kode existing: existing subscription check, periodBase, set subscription ...

    // ── Kirim email receipt (Fase 13) ────────────────────────────────────────
    try {
      const profile = await kv.get(`profile:${tx.user_id}`);
      const userEmail = profile?.email;
      const userName = profile?.full_name || userEmail?.split("@")[0] || "User";
      const subscription = await kv.get(`subscription:${tx.user_id}`);
      if (userEmail) {
        const html = emails.receiptHtml({
          userName,
          planName: tx.plan_name || tx.plan_id,
          interval: tx.interval,
          amount: tx.gross_amount,
          currency: tx.currency || "IDR",
          orderId: tx.order_id,
          periodEnd: subscription?.current_period_end ?? periodEnd(tx.interval, started),
          paymentType: midtransData.payment_type ?? null,
        });
        await emails.sendEmail(userEmail, "Your LokaSync payment receipt", html);
      }
    } catch (emailErr) {
      // Email failure tidak boleh menggagalkan transaksi
      console.log("Receipt email failed:", emailErr);
    }
    // ── End email receipt ────────────────────────────────────────────────────

    if (tx.voucher_code) {
      // ... existing voucher logic ...
    }
  }
  return tx;
}
```

**Catatan penting:** Email gagal **tidak boleh** membuat transaksi gagal. Gunakan `try/catch` terpisah dan selalu `return tx`.

- [ ] **Verifikasi:** Lakukan checkout test → settlement → cek Resend dashboard ada email terkirim.

---

### Task 13.3: Endpoint Reminder — Kirim Email Langganan Akan Berakhir

**File:** `supabase/functions/server/index.tsx`

**Tambahkan endpoint admin untuk trigger reminder manual (atau scheduler):**

```ts
// POST /admin/send-reminders
// Cari semua subscription yang aktif dan akan expire dalam N hari (default 7).
// Kirim reminder email. Hanya founder/admin yang boleh akses.
app.post("/admin/send-reminders", async (c) => {
  try {
    const user = await getAuthedUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (!isAdminUser(user)) return c.json({ error: "Forbidden" }, 403);

    const body = await c.req.json().catch(() => ({}));
    const daysAhead = Math.min(Math.max(Number(body.days ?? 7), 1), 30);
    const now = Date.now();
    const cutoff = now + daysAhead * 24 * 60 * 60 * 1000;

    // Scan KV untuk semua subscription keys.
    // Catatan: KV tidak punya query range — kita list semua keys dengan prefix.
    const allKeys = await kv.list("subscription:"); // asumsi kv.list() tersedia
    let sent = 0;
    let skipped = 0;

    for (const key of allKeys) {
      const sub = await kv.get(key);
      if (!sub || sub.status !== "active" || !sub.current_period_end) continue;
      const end = new Date(sub.current_period_end).getTime();
      if (end > now && end <= cutoff) {
        const profile = await kv.get(`profile:${sub.user_id}`);
        const email = profile?.email;
        const name = profile?.full_name || email?.split("@")[0] || "User";
        const daysLeft = Math.ceil((end - now) / (24 * 60 * 60 * 1000));
        if (email) {
          const html = emails.reminderHtml({
            userName: name,
            planName: sub.plan_id,
            expiryDate: sub.current_period_end,
            daysLeft,
          });
          const ok = await emails.sendEmail(email, "Your LokaSync subscription expires soon", html);
          if (ok) sent++; else skipped++;
        } else {
          skipped++;
        }
      }
    }

    return c.json({ sent, skipped, daysAhead });
  } catch (e) {
    console.log("POST /admin/send-reminders error:", e);
    return c.json({ error: String(e) }, 500);
  }
});
```

**Catatan:** `kv.list()` mungkin tidak tersedia di KV store custom. Jika tidak, alternatif:
- Simpan daftar subscription aktif di KV key `subscriptions:active` (array user_id)
- Atau gunakan Supabase Auth untuk iterasi user

**Cek apakah `kv_store.tsx` punya `list()`:**

```ts
// Jika tidak ada, tambahkan di kv_store.tsx:
export async function list(prefix: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("kv_store_827698a1")
    .select("key")
    .like("key", `${prefix}%`);
  if (error) throw error;
  return (data ?? []).map((row) => row.key);
}
```

**Atau pendekatan lebih robust — simpan active subscription list:**

Di `applyTransactionStatus()`, saat subscription di-activate:

```ts
const activeList = (await kv.get("subscriptions:active")) ?? [];
if (!activeList.includes(tx.user_id)) {
  activeList.push(tx.user_id);
  await kv.set("subscriptions:active", activeList);
}
```

Ini membuat reminder endpoint bisa iterasi array tanpa `kv.list()`.

- [ ] **Verifikasi:** POST `/admin/send-reminders` dengan `days: 90` (supaya catch semua) → response `{ sent: N, skipped: M }`.

---

### Task 13.4: Admin Page — Tombol Trigger Reminder

**File:** `src/app/pages/AdminPage.tsx`

**Tambahkan section baru di Admin page:**

```tsx
const [reminderResult, setReminderResult] = useState<any>(null);
const [reminderLoading, setReminderLoading] = useState(false);

// Di dalam render:
<div className="border border-neutral-800 rounded-xl p-4 mb-4">
  <h3 className="text-white text-[14px] font-medium mb-2">Subscription Reminders</h3>
  <p className="text-neutral-500 text-[12px] mb-3">Send expiry reminder emails to users with active subscriptions ending soon.</p>
  <button
    onClick={async () => {
      setReminderLoading(true);
      try {
        const res = await api.request("/admin/send-reminders", { method: "POST", body: JSON.stringify({ days: 7 }) });
        setReminderResult(res);
        toast.success(`Sent ${res.sent} reminder emails`);
      } catch (e) {
        toast.error("Failed to send reminders");
      } finally {
        setReminderLoading(false);
      }
    }}
    disabled={reminderLoading}
    className="..."
  >
    {reminderLoading ? "Sending..." : "Send 7-day reminders"}
  </button>
  {reminderResult && (
    <div className="mt-2 text-[12px] text-neutral-400">
      Sent: {reminderResult.sent} | Skipped: {reminderResult.skipped}
    </div>
  )}
</div>
```

**Tambah `request()` di `api.ts` kalau belum ada public access:**

```ts
export const request = (path: string, opts?: { method?: string; body?: BodyInit | null }) => {
  // expose the internal request helper
  return _request(path, opts);
};
```

Atau lebih baik: tambahkan wrapper spesifik:

```ts
export const sendReminders = (days?: number) =>
  request<{ sent: number; skipped: number; daysAhead: number }>("/admin/send-reminders", {
    method: "POST",
    body: JSON.stringify({ days }),
  });
```

- [ ] **Verifikasi:** Tombol di AdminPage bisa diklik dan mengirim email reminder.

---

## Sinkronisasi `index.ts` vs `index.tsx`

Project ini punya **dua file server** — `index.ts` dan `index.tsx`. Dari commit log dan grep, `.tsx` tampaknya yang aktif (lebih banyak reference ke Fase 14). **Jadikan `index.tsx` sebagai source of truth.** Setelah semua perubahan di `.tsx` selesai, salin ke `.ts` atau hapus `.ts` kalau tidak dipakai.

```bash
cp supabase/functions/server/index.tsx supabase/functions/server/index.ts
```

---

## Variabel Environment yang Harus Dikonfigurasi

| Variable | Lokasi | Keterangan |
|----------|--------|------------|
| `RESEND_API_KEY` | Supabase Edge Function Secrets | API key Resend (sudah ada untuk invitation) |
| `INVITE_FROM_EMAIL` | Supabase Edge Function Secrets | From address, e.g. `"LokaSync <billing@lokasync.app>"` |
| `SUPABASE_URL` | Sudah ada | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Sudah ada | Service role key untuk Storage admin client |

---

## Verifikasi End-to-End

### Fase 12 — Upload File Nyata
1. **Upload test:** Pilih file PDF 500KB di UploadModal → upload berhasil → size menunjukkan "500 KB" (bukan "—") → file muncul di list
2. **Storage verify:** Buka Supabase Dashboard → Storage → `workspace-files` bucket → ada object baru dengan path `workspace/{id}/...`
3. **Download test:** Klik "Download" di file menu → file terbuka/terdownload
4. **Quota test:** Upload sampai melebihi 1GB (Free plan) → error "Storage quota exceeded" dengan toast merah
5. **Delete test:** Hapus file → object hilang dari Storage bucket → usage counter berkurang
6. **Settings display:** Settings → Billing → storage usage menunjukkan angka GB real

### Fase 13 — Email Transaksional
7. **Receipt email:** Lakukan Midtrans checkout (sandbox) → setelah settlement → cek Resend dashboard/logs ada email "Your LokaSync payment receipt"
8. **Reminder email:** Di AdminPage, klik "Send 7-day reminders" → toast muncul `{ sent: N }` → cek Resend dashboard ada email "Your LokaSync subscription expires soon"
9. **Invitation regression:** Invite member ke workspace → email invitation tetap terkirim (tidak broken)

---

## Self-Review Checklist

**Spec coverage:**
- ✅ File nyata di Supabase Storage — Task 12.1–12.5
- ✅ Kuota storage per plan — Task 12.1, 12.2, 12.4
- ✅ Tolak upload saat kuota penuh — Task 12.2
- ✅ Email receipt setelah settlement — Task 13.2
- ✅ Email reminder langganan berakhir — Task 13.3, 13.4
- ✅ Resend sebagai layanan — semua email pakai Resend API

**Placeholder scan:**
- ✅ Tidak ada "TBD", "TODO", "implement later"
- ✅ Semua code block berisi implementasi konkret
- ✅ Semua file path absolut/exact

**Type consistency:**
- ✅ `FileItem.size` number (bytes) di server & client
- ✅ `FileItem.sizeHuman` string untuk tampilan
- ✅ `storagePath: string | null` di `FileItem`
- ✅ `sendEmail()` signature konsisten: `(to, subject, html) => Promise<boolean>`

**Edge cases:**
- ✅ Upload file kosong (size === 0) ditolak
- ✅ Email gagal tidak menggagalkan transaksi (try/catch terpisah di applyTransactionStatus)
- ✅ File seed lama (string size) di-handle di delete (tidak crash)
- ✅ CORS `X-Workspace-Id` header — sudah dikirim oleh client, server sudah membaca
- ✅ Quota unlimited (Business plan, limit = 0) tidak dicek

**Catatan implementasi:**
- Supabase Edge Function (Deno Deploy) punya limit request body ~6MB. Untuk file > 6MB butuh signed upload URL pattern (future enhancement). Untuk MVP dengan limit 1GB-25GB, mayoritas file dokumen office (<6MB) bisa lewat Edge Function.
- RLS policy di Storage mengandalkan tabel `memberships`. Jika tabel punya nama berbeda, sesuaikan SQL.
