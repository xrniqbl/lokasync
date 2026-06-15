/**
 * Central translation dictionary for the LokaSync dashboard.
 * Keys are grouped by feature area. Add new keys as needed.
 */
import type { Lang } from "./i18n";

const dict = {
  // ── Sidebar / Nav ─────────────────────────────────────────────────────
  "nav.dashboard": { en: "Dashboard", id: "Dasbor" },
  "nav.tasks": { en: "Tasks", id: "Tugas" },
  "nav.projects": { en: "Projects", id: "Proyek" },
  "nav.calendar": { en: "Calendar", id: "Kalender" },
  "nav.teams": { en: "Teams", id: "Tim" },
  "nav.analytics": { en: "Analytics", id: "Analitik" },
  "nav.files": { en: "Files", id: "Berkas" },
  "nav.settings": { en: "Settings", id: "Pengaturan" },
  "nav.profile": { en: "Profile", id: "Profil" },
  "nav.search": { en: "Search…", id: "Cari…" },
  "nav.logout": { en: "Log out", id: "Keluar" },

  // ── Sidebar sections ──────────────────────────────────────────────────
  "sidebar.planning": { en: "Planning", id: "Perencanaan" },
  "sidebar.resources": { en: "Resources", id: "Sumber Daya" },
  "sidebar.favorites": { en: "Favorites", id: "Favorit" },
  "sidebar.channels": { en: "Channels", id: "Kanal" },
  "sidebar.direct": { en: "Direct Messages", id: "Pesan Langsung" },
  "sidebar.collapse": { en: "Collapse sidebar", id: "Tutup sidebar" },
  "sidebar.expand": { en: "Expand sidebar", id: "Buka sidebar" },

  // ── Dashboard ─────────────────────────────────────────────────────────
  "dashboard.welcome": { en: "Welcome back", id: "Selamat datang kembali" },
  "dashboard.overview": { en: "Overview", id: "Ringkasan" },
  "dashboard.totalTasks": { en: "Total Tasks", id: "Total Tugas" },
  "dashboard.completed": { en: "Completed", id: "Selesai" },
  "dashboard.inProgress": { en: "In Progress", id: "Sedang Berjalan" },
  "dashboard.overdue": { en: "Overdue", id: "Terlambat" },
  "dashboard.recentActivity": { en: "Recent Activity", id: "Aktivitas Terbaru" },
  "dashboard.upcomingDeadlines": { en: "Upcoming Deadlines", id: "Tenggat Waktu" },
  "dashboard.teamPerformance": { en: "Team Performance", id: "Kinerja Tim" },
  "dashboard.quickActions": { en: "Quick Actions", id: "Aksi Cepat" },
  "dashboard.noActivity": { en: "No recent activity", id: "Belum ada aktivitas" },

  // ── Tasks ─────────────────────────────────────────────────────────────
  "tasks.title": { en: "Tasks", id: "Tugas" },
  "tasks.addTask": { en: "Add Task", id: "Tambah Tugas" },
  "tasks.newTask": { en: "New Task", id: "Tugas Baru" },
  "tasks.dueDate": { en: "Due Date", id: "Tenggat" },
  "tasks.priority": { en: "Priority", id: "Prioritas" },
  "tasks.status": { en: "Status", id: "Status" },
  "tasks.assignee": { en: "Assignee", id: "Ditugaskan" },
  "tasks.high": { en: "High", id: "Tinggi" },
  "tasks.medium": { en: "Medium", id: "Sedang" },
  "tasks.low": { en: "Low", id: "Rendah" },
  "tasks.todo": { en: "To Do", id: "Belum Dikerjakan" },
  "tasks.done": { en: "Done", id: "Selesai" },
  "tasks.noTasks": { en: "No tasks yet", id: "Belum ada tugas" },
  "tasks.filter": { en: "Filter", id: "Filter" },
  "tasks.sort": { en: "Sort", id: "Urutkan" },

  // ── Projects ──────────────────────────────────────────────────────────
  "projects.title": { en: "Projects", id: "Proyek" },
  "projects.newProject": { en: "New Project", id: "Proyek Baru" },
  "projects.members": { en: "Members", id: "Anggota" },
  "projects.progress": { en: "Progress", id: "Progres" },
  "projects.deadline": { en: "Deadline", id: "Tenggat" },
  "projects.active": { en: "Active", id: "Aktif" },
  "projects.archived": { en: "Archived", id: "Diarsipkan" },
  "projects.noProjects": { en: "No projects yet", id: "Belum ada proyek" },

  // ── Calendar ──────────────────────────────────────────────────────────
  "calendar.title": { en: "Calendar", id: "Kalender" },
  "calendar.today": { en: "Today", id: "Hari Ini" },
  "calendar.month": { en: "Month", id: "Bulan" },
  "calendar.week": { en: "Week", id: "Minggu" },
  "calendar.day": { en: "Day", id: "Hari" },
  "calendar.addEvent": { en: "Add Event", id: "Tambah Acara" },
  "calendar.noEvents": { en: "No events", id: "Belum ada acara" },

  // ── Teams ─────────────────────────────────────────────────────────────
  "teams.title": { en: "Teams", id: "Tim" },
  "teams.members": { en: "Members", id: "Anggota" },
  "teams.invite": { en: "Invite", id: "Undang" },
  "teams.role": { en: "Role", id: "Peran" },
  "teams.admin": { en: "Admin", id: "Admin" },
  "teams.member": { en: "Member", id: "Anggota" },
  "teams.viewer": { en: "Viewer", id: "Pengamat" },

  // ── Files ─────────────────────────────────────────────────────────────
  "files.title": { en: "Files", id: "Berkas" },
  "files.upload": { en: "Upload", id: "Unggah" },
  "files.download": { en: "Download", id: "Unduh" },
  "files.delete": { en: "Delete", id: "Hapus" },
  "files.rename": { en: "Rename", id: "Ubah Nama" },
  "files.noFiles": { en: "No files yet", id: "Belum ada berkas" },
  "files.newFolder": { en: "New Folder", id: "Folder Baru" },

  // ── Analytics ─────────────────────────────────────────────────────────
  "analytics.title": { en: "Analytics", id: "Analitik" },
  "analytics.taskCompletion": { en: "Task Completion", id: "Penyelesaian Tugas" },
  "analytics.teamActivity": { en: "Team Activity", id: "Aktivitas Tim" },
  "analytics.projectHealth": { en: "Project Health", id: "Kesehatan Proyek" },
  "analytics.thisWeek": { en: "This Week", id: "Minggu Ini" },
  "analytics.thisMonth": { en: "This Month", id: "Bulan Ini" },
  "analytics.last30Days": { en: "Last 30 Days", id: "30 Hari Terakhir" },

  // ── Settings ──────────────────────────────────────────────────────────
  "settings.title": { en: "Settings", id: "Pengaturan" },
  "settings.account": { en: "Account", id: "Akun" },
  "settings.workspace": { en: "Workspace", id: "Ruang Kerja" },
  "settings.advanced": { en: "Advanced", id: "Lanjutan" },
  "settings.profile": { en: "Profile", id: "Profil" },
  "settings.security": { en: "Security", id: "Keamanan" },
  "settings.notifications": { en: "Notifications", id: "Notifikasi" },
  "settings.appearance": { en: "Appearance", id: "Tampilan" },
  "settings.language": { en: "Language", id: "Bahasa" },
  "settings.timezone": { en: "Timezone", id: "Zona Waktu" },
  "settings.defaultNotif": { en: "Default Notifications", id: "Notifikasi Default" },
  "settings.members": { en: "Members", id: "Anggota" },
  "settings.billing": { en: "Billing", id: "Tagihan" },
  "settings.integrations": { en: "Integrations", id: "Integrasi" },
  "settings.apiKeys": { en: "API Keys", id: "Kunci API" },
  "settings.auditLog": { en: "Audit Log", id: "Log Audit" },
  "settings.dataExport": { en: "Data & Export", id: "Data & Ekspor" },
  "settings.dangerZone": { en: "Danger Zone", id: "Zona Bahaya" },
  "settings.save": { en: "Save changes", id: "Simpan perubahan" },
  "settings.saved": { en: "Settings saved", id: "Pengaturan tersimpan" },

  // ── Common / Shared ───────────────────────────────────────────────────
  "common.save": { en: "Save", id: "Simpan" },
  "common.cancel": { en: "Cancel", id: "Batal" },
  "common.delete": { en: "Delete", id: "Hapus" },
  "common.edit": { en: "Edit", id: "Edit" },
  "common.create": { en: "Create", id: "Buat" },
  "common.close": { en: "Close", id: "Tutup" },
  "common.loading": { en: "Loading…", id: "Memuat…" },
  "common.error": { en: "Something went wrong", id: "Terjadi kesalahan" },
  "common.retry": { en: "Retry", id: "Coba Lagi" },
  "common.confirm": { en: "Confirm", id: "Konfirmasi" },
  "common.search": { en: "Search", id: "Cari" },
  "common.noResults": { en: "No results found", id: "Tidak ada hasil" },
  "common.viewAll": { en: "View all", id: "Lihat semua" },
  "common.back": { en: "Back", id: "Kembali" },
  "common.next": { en: "Next", id: "Selanjutnya" },
  "common.previous": { en: "Previous", id: "Sebelumnya" },
  "nav.billing": { en: "Billing", id: "Tagihan" },
  "settings.chooseLanguage": { en: "Choose the display language for the entire application.", id: "Pilih bahasa tampilan untuk seluruh aplikasi." },
  "settings.changesApply": { en: "Changes apply immediately across the entire application.", id: "Perubahan langsung diterapkan di seluruh aplikasi." },
} as const;

export type TranslationKey = keyof typeof dict;

/** Return a translated string. */
export function t(key: TranslationKey, lang: Lang): string {
  return dict[key]?.[lang] ?? dict[key]?.en ?? key;
}

export default dict;
