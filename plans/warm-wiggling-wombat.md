# Supabase Full Integration Plan

## Context
All mock/dummy data in the app must be replaced with real Supabase-backed data. Every page (Tasks, Projects, Teams, Calendar, Files, Dashboard, Settings) uses hardcoded `initialX` arrays in local React state that resets on every page refresh. All data must be persisted in and served from Supabase via the KV store.

Since only `kv_store_827698a1` is available (no custom tables), we use a structured key naming convention. Architecture: **Frontend → Hono server → kv_store**.

---

## Data Key Schema (KV store)

| Key | Shape | Description |
|-----|-------|-------------|
| `tasks:list` | `Task[]` | All tasks |
| `projects:list` | `Project[]` | All projects |
| `teams:list` | `Team[]` | Teams with embedded members |
| `calendar:events` | `Record<string, CalendarEvent[]>` | Day-keyed event map |
| `files:list` | `FileItem[]` | All files incl. archived |
| `files:folders` | `Folder[]` | All folders |
| `settings:profile` | object | User profile |
| `settings:workspace` | object | Workspace config |
| `settings:notifications` | object | Notification prefs |
| `settings:appearance` | object | Theme/display prefs |
| `settings:timezone` | object | Time/date prefs |
| `settings:members` | object | Member rows + pending invites |
| `settings:billing` | object | Plan, payment, invoices |
| `settings:api-keys` | `ApiKey[]` | API keys list |
| `settings:webhooks` | `Webhook[]` | Webhooks list |
| `settings:audit-log` | `AuditEntry[]` | Audit log entries |

**Seeding**: On every GET, if the KV key is `undefined` (first load), the server seeds it with the existing mock data and returns it. After seeding the data is in KV, so all subsequent edits persist.

---

## Part 1 — Server (`supabase/functions/server/index.tsx`)

Complete rewrite to add all REST endpoints. All prefixed with `/make-server-827698a1`.

### Tasks
- `GET /tasks` → get or seed `tasks:list`
- `POST /tasks` → append new task
- `PUT /tasks/:id` → patch task fields
- `DELETE /tasks/:id` → remove task

### Projects
- `GET /projects` → get or seed `projects:list`
- `POST /projects` → append project
- `PUT /projects/:id` → patch project
- `DELETE /projects/:id` → remove project

### Teams
- `GET /teams` → get or seed `teams:list`
- `POST /teams/invite` → add member to a team
- `PUT /teams/member` → update member (role/status) — body: `{teamName, initials, patch}`
- `DELETE /teams/member` → remove member — body: `{teamName, initials}`

### Calendar
- `GET /calendar` → get or seed `calendar:events`
- `POST /calendar/events` → add event `{date, event}`
- `DELETE /calendar/events` → remove event `{date, index}`

### Files
- `GET /files` → get or seed both `files:list` and `files:folders`
- `POST /files` → append file
- `PUT /files` → rename file `{oldName, newName}`
- `DELETE /files/:name` → remove file
- `POST /files/folders` → append folder

### Settings
- `GET /settings/:section` → get or seed section
- `PUT /settings/:section` → save section data

Sections: `profile`, `workspace`, `notifications`, `appearance`, `timezone`, `members`, `billing`, `api-keys`, `webhooks`, `audit-log`

All seed data (copied from current mock arrays) is embedded as constants in the server file and used only when the KV key doesn't exist yet.

---

## Part 2 — API Client (`src/app/utils/api.ts`) — NEW FILE

Typed wrapper around `fetch`:
- Imports `projectId` and `publicAnonKey` from `/utils/supabase/info`
- Base URL: `https://${projectId}.supabase.co/functions/v1/make-server-827698a1`
- Auth header: `Authorization: Bearer ${publicAnonKey}`
- Named async functions for every operation: `getTasks()`, `createTask()`, `updateTask()`, `deleteTask()`, `getProjects()`, etc.
- Each function throws a descriptive error on non-2xx responses

---

## Part 3 — Component Changes

### Pattern (same for every page)
1. Remove hardcoded `initialX` array
2. `const [data, setData] = useState<Type[]>([])`
3. `const [loading, setLoading] = useState(true)`
4. Mount `useEffect` → call `api.getX()`, then `setData(result)`, `setLoading(false)`
5. All mutation handlers → call `api.mutateX(...)` then update local state
6. Show a loading skeleton row while `loading === true`

### TasksPage.tsx
- Remove `initialTasks`
- Fetch on mount via `api.getTasks()`
- `handleAddTask` → `api.createTask(task)` then append to state
- `toggleTask` → `api.updateTask(id, { completed, status })` then patch state
- `handleDeleteTask` → `api.deleteTask(id)` then filter state
- `handleUpdateTask` → `api.updateTask(id, patch)` then patch state

### ProjectsPage.tsx
- Remove `initialProjects`
- Fetch on mount via `api.getProjects()`
- `NewProjectModal` confirm → `api.createProject(project)` then append
- Sub-task arrays (webFrontendTasks, etc.) stay static — project detail views

### TeamsPage.tsx
- Remove `initialTeams`
- Fetch on mount via `api.getTeams()`
- `InviteMemberModal` confirm → `api.inviteMember({teamName, member})` then update state
- `ManageTeamModal` confirm → `api.updateMember({teamName, initials, patch})` then update state

### CalendarPage.tsx
- Remove `initialEvents` map
- Fetch on mount via `api.getCalendarEvents()`
- `handleAddEvent` → `api.createCalendarEvent({date, event})` then update state

### FilesPage.tsx
- Remove `rootFiles`, `archivedFiles`, `initialFolders`, `folderFiles`
- Fetch on mount via `api.getFiles()` → `{ files, folders }`
- `deleteFile` → `api.deleteFile(name)` then filter state
- `commitRename` → `api.renameFile({oldName, newName})` then update state
- New folder → `api.createFolder(name)` then append
- New file upload → `api.createFile(file)` then append

### DashboardPage.tsx
- Dashboard chart arrays stay static (computed/reporting data, not user-editable)
- Recent tasks card: fetch from `api.getTasks()`, show latest 5 by due date
- Today's schedule: fetch from `api.getCalendarEvents()`, filter for today's date

### SettingsPage.tsx
All 14 sections that have editable state connect to settings endpoints:
- All sections: fetch `api.getSettings(section)` on mount, merge with local defaults
- Save buttons: call `api.saveSettings(section, data)` then show toast
- Members: save on invite/role-change/remove
- API Keys: save on generate/revoke
- Webhooks: save on add/delete
- Audit Log: read-only fetch

---

## Files Modified
1. `supabase/functions/server/index.tsx` — full rewrite with all CRUD + seed logic
2. `src/app/utils/api.ts` — **new file**
3. `src/app/components/TasksPage.tsx`
4. `src/app/components/ProjectsPage.tsx`
5. `src/app/components/TeamsPage.tsx`
6. `src/app/components/CalendarPage.tsx`
7. `src/app/components/FilesPage.tsx`
8. `src/app/components/DashboardPage.tsx` (partial — recent tasks + today events)
9. `src/app/components/SettingsPage.tsx`

---

## Verification
1. Refresh any page → data persists (tasks, projects, teams, files survive reload)
2. Create a task → visible in list, survives refresh
3. Delete a task → gone after refresh
4. Toggle task status → persists
5. Settings changes → reloaded correctly on next visit
6. Calendar events → persist across reloads
7. Files rename/delete → persist
8. Supabase KV table shows populated keys at correct paths
