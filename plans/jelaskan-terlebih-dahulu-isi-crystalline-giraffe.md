# Rencana: Aktifkan Semua Fitur & Interaksi

## Context

Aplikasi Project Management sudah dibangun dengan 8 halaman (Dashboard, Tasks, Projects, Calendar, Teams, Analytics, Files, Settings). Namun banyak tombol, tab, card, dan elemen interaktif yang masih mati (tidak ada onClick, atau hanya console.log). Tujuan rencana ini adalah mengaktifkan semua elemen agar benar-benar berfungsi saat diklik.

---

## Infrastruktur Baru yang Diperlukan

### 1. NavigationContext (`src/app/components/NavigationContext.tsx`)
Halaman-halaman (DashboardPage, TasksPage, dll.) saat ini tidak punya akses ke `onSectionChange`. Buat React Context agar semua halaman bisa berpindah ke halaman lain tanpa prop drilling.

```tsx
export const NavigationContext = createContext({ navigate: (_: string) => {} });
export function useNavigation() { return useContext(NavigationContext); }
```

Pasang provider di `App.tsx`, bungkus seluruh layout.

### 2. Toast Notifications (`sonner` — sudah terinstall)
Semua aksi "simpan", "buat", "hapus", "connect/disconnect" akan menampilkan toast. Import dari `"sonner"`.

---

## Daftar Perbaikan Per File

### `SidebarDemo.tsx`
- **Line 339, 350**: Ganti `console.log()` dengan `onItemClick()` yang di-wire ke state navigasi sidebar detail (sub-item klik = tampilkan info di main content, atau noop yang elegan)

### `DashboardPage.tsx`
- **"+ New task" button**: Buka modal `<NewTaskModal>` (Radix Dialog)
- **"View all →" button**: Panggil `useNavigation().navigate("tasks")`

### `TasksPage.tsx`
- **"+ New task" button**: Buka modal `<NewTaskModal>` — tambahkan task baru ke local state list
- **"Filter" button**: Toggle panel filter (priority, status, project) yang memfilter list secara real-time

### `ProjectsPage.tsx`
- **"+ New project" button**: Buka modal `<NewProjectModal>` — form dengan nama, deskripsi, due date
- **Project cards onClick**: Buka `<ProjectDetailModal>` (menampilkan info project lengkap)

### `CalendarPage.tsx`
- **"‹" / "›" buttons**: Ubah state `currentMonth`/`currentYear`, hitung ulang grid hari
- **"Today" button**: Set `currentMonth` kembali ke Juni 2026, `selectedDay = 8`
- **"+ Event" button**: Buka modal `<NewEventModal>` — form title + time + tag

### `TeamsPage.tsx`
- **"Invite" button & "Invite card"**: Buka modal `<InviteMemberModal>` — form email + team + role
- **"Manage" button**: Buka modal `<ManageTeamModal>` — list anggota dengan tombol remove
- **Member cards**: Buka `<MemberProfileModal>` — info member + task list kecil

### `AnalyticsPage.tsx`
- **Period select `<select>`**: Ubah state `period`, gunakan slice data berbeda per pilihan (Last 8 weeks / Last 3 months / This quarter)
- **"Export" button**: `toast.success("Report exported")` — simulasi download

### `FilesPage.tsx`
- **"Upload" button**: Buka `<UploadModal>` — dropzone UI (tanpa real upload, toast saat konfirmasi)
- **"+ New folder" button**: Buka `<NewFolderModal>` — input nama folder, tambahkan ke local state
- **"All Files" breadcrumb**: Reset state breadcrumb ke root
- **Folder cards**: Masuk ke dalam folder (ubah breadcrumb, tampilkan file di folder tersebut)
- **"⋯" file menu**: Tampilkan dropdown kecil (Rename, Download, Delete) menggunakan Radix DropdownMenu

### `SettingsPage.tsx`
- **"Change photo" button**: Buka file input tersembunyi, preview foto baru
- **"Save changes" button**: Validasi form sederhana + `toast.success("Changes saved")`
- **"Enable 2FA" button**: Buka modal 2FA setup (tampilkan QR code palsu + input code)
- **"Update password" button**: Validasi (konfirmasi cocok, min 12 char) + `toast.success` atau `toast.error`
- **"Connect" / "Disconnect" buttons**: Toggle state `connected` + `toast.success("Connected to Slack")`

---

## Modal Components yang Dibuat

Semua modal menggunakan Radix `@radix-ui/react-dialog` (sudah terinstall):

| File | Modal |
|------|-------|
| `components/modals/NewTaskModal.tsx` | Form: judul, prioritas, project, assignee, due date |
| `components/modals/NewProjectModal.tsx` | Form: nama, deskripsi, due date |
| `components/modals/ProjectDetailModal.tsx` | Tampilan detail project + progress |
| `components/modals/NewEventModal.tsx` | Form: judul, tanggal, jam, tag |
| `components/modals/InviteMemberModal.tsx` | Form: email, team, role |
| `components/modals/ManageTeamModal.tsx` | List anggota + remove button |
| `components/modals/MemberProfileModal.tsx` | Profil anggota + task count |
| `components/modals/UploadModal.tsx` | Dropzone UI (simulasi) |
| `components/modals/NewFolderModal.tsx` | Input nama folder |

---

## Verification

Setelah implementasi, cek semua ini bisa diklik dan memberikan respons visual:
1. Klik "New task" di Dashboard → modal terbuka, isi form, submit → task muncul di Tasks page
2. Klik "View all" di Dashboard → navigasi ke Tasks page
3. Klik tabs di Tasks (Today/In Progress/Review/Done) → list berubah
4. Klik "Filter" di Tasks → panel muncul, pilih filter → list tersaring
5. Klik "New project" → modal terbuka, submit → card baru muncul
6. Klik project card → detail modal terbuka
7. Navigasi kalender prev/next month → grid berubah bulan
8. Klik "+ Event" → modal terbuka
9. Klik "Invite" di Teams → modal terbuka
10. Klik member card → profil modal terbuka
11. Ganti period di Analytics → chart data berubah
12. Klik "Export" → toast muncul
13. Klik folder di Files → breadcrumb berubah
14. Klik "⋯" di file → dropdown muncul
15. Klik "Save" di Settings → toast "Changes saved"
16. Klik "Connect" integration → toggle status

---

## Isi Lama (Referensi)

### Struktur Sidebar

Ada **dua lapisan sidebar**:

1. **Sidebar Kiri (IconNavigation)** — Navigasi ikon vertikal sempit, berisi 7 seksi utama
2. **Sidebar Kanan (DetailSidebar)** — Panel konten lebar yang berubah isinya sesuai seksi aktif

---

### Rincian Setiap Seksi Sidebar

#### 1. Dashboard
- **Dashboard Types**: Overview, Executive Summary, Operations Dashboard, Financial Dashboard
- **Report Summaries**: Weekly Reports, Monthly Insights, Quarterly Analysis
- **Business Intelligence**: Performance Metrics, Predictive Analytics

#### 2. Tasks
- **Quick Actions**: New Task, Filter Tasks
- **My Tasks**: Due Today, In Progress, Completed
- **Other**: Priority Tasks, Archived

#### 3. Projects
- **Quick Actions**: New Project, Filter Projects
- **Active Projects**: Web Application, Mobile App
- **Other**: Completed, Archived

#### 4. Calendar
- **Views**: Month View, Week View, Day View
- **Events**: Today's Events, Upcoming Events
- **Quick Actions**: New Event, Share Calendar

#### 5. Teams
- **My Teams**: Development Team, Design Team (dengan daftar anggota)
- **Quick Actions**: Invite Member, Manage Teams

#### 6. Analytics
- **Reports**: Performance Report, Task Completion, Team Productivity
- **Insights**: Key Metrics (dengan sub-analitik detail)

#### 7. Files
- **Quick Actions**: Upload File, New Folder
- **Recent Files**: Recent Documents, Shared with Me
- **Organization**: All Folders, Archived Files

#### 8. Settings
- **Account**: Profile Settings, Security, Notifications
- **Workspace**: Preferences, Integrations

---

## Cocoknya untuk Website Apa?

Berdasarkan keseluruhan isi sidebar di atas, proyek ini **paling cocok dijadikan**:

### ✅ Project Management & Team Collaboration App
Seperti: **Asana, Linear, Notion, atau ClickUp**

**Alasannya:**
- Fitur Tasks + Projects = manajemen tugas dan proyek tim
- Fitur Teams = kolaborasi anggota tim
- Fitur Calendar = penjadwalan sprint/deadline
- Fitur Analytics = laporan produktivitas tim
- Fitur Dashboard = ringkasan eksekutif dan KPI
- Fitur Files = penyimpanan dokumen proyek

### Alternatif lain yang cocok:
1. **Business Intelligence Dashboard** — Fokus ke Dashboard + Analytics untuk eksekutif perusahaan
2. **HR & Workforce Management Tool** — Fokus ke Teams + Tasks + Calendar untuk pengelolaan SDM
3. **SaaS Admin Panel** — Panel admin lengkap untuk produk berbasis langganan

---

## Desain Visual

- Tema gelap (dark mode) dengan latar hitam
- Font Lexend
- Animasi halus pada collapse/expand menu
- Ikon dari Carbon Icons (IBM)
- Tinggi tetap 800px — cocok untuk desktop-first app

---

## Rekomendasi Implementasi

Jika ingin dikembangkan menjadi **Project Management App**, langkah selanjutnya:

1. Tambahkan konten utama (main content area) di sebelah kanan sidebar
2. Isi setiap seksi dengan komponen yang relevan (task list, kanban board, calendar grid, team roster, analytics chart)
3. Hubungkan navigasi sidebar ke routing halaman menggunakan react-router
4. Integrasikan backend/database (Supabase direkomendasikan) untuk data persisten
