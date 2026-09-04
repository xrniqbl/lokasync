import type { Project } from "../../../utils/api";

// ── Tab types ────────────────────────────────────────────────────────────────

export type TabId = "description" | "comments" | "activity" | "files" | "checklist" | "settings";

// ── Persisted per-project types ──────────────────────────────────────────────

export interface LocalComment {
  id: string;
  author: string;
  authorInitials: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  reactions: { emoji: string; userId: string }[];
  parentId?: string;
}

export interface LocalActivity {
  id: string;
  type: "status" | "priority" | "comment" | "file" | "checklist" | "created" | "updated" | "assignee" | "star" | "visibility" | "time";
  description: string;
  timestamp: string;
  userId: string;
}

export interface LocalChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
}

export interface LocalFileItem {
  name: string;
  type: string;
  size: string;
  modified: string;
  owner: string;
  url?: string;
}

// ── Modal state ──────────────────────────────────────────────────────────────

export interface ProjectDetailState {
  project: Project;
  activeTab: TabId;
  starred: boolean;
  comments: LocalComment[];
  activities: LocalActivity[];
  checklist: LocalChecklistItem[];
  files: LocalFileItem[];
  timeTracking: { estimated: number; logged: number };
  visibility: "public" | "private";
}

// ── localStorage persistence ─────────────────────────────────────────────────

const STORAGE_PREFIX = "projectDetail_";

interface PersistedData {
  starred: boolean;
  comments: LocalComment[];
  activities: LocalActivity[];
  checklist: LocalChecklistItem[];
  files: LocalFileItem[];
  timeTracking: { estimated: number; logged: number };
  visibility: "public" | "private";
}

export function loadPersistedState(projectId: string): PersistedData | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistState(projectId: string, data: PersistedData): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

// ── Reducer actions ──────────────────────────────────────────────────────────

export type ProjectDetailAction =
  | { type: "SET_PROJECT"; project: Project }
  | { type: "RESET_FOR_PROJECT"; project: Project; persisted: PersistedData | null }
  | { type: "SET_TAB"; tab: TabId }
  | { type: "TOGGLE_STAR" }
  | { type: "ADD_COMMENT"; comment: LocalComment }
  | { type: "UPDATE_COMMENT"; id: string; content: string }
  | { type: "DELETE_COMMENT"; id: string }
  | { type: "ADD_COMMENT_REACTION"; commentId: string; emoji: string; userId: string }
  | { type: "REMOVE_COMMENT_REACTION"; commentId: string; emoji: string; userId: string }
  | { type: "ADD_ACTIVITY"; activity: LocalActivity }
  | { type: "ADD_CHECKLIST_ITEM"; item: LocalChecklistItem }
  | { type: "UPDATE_CHECKLIST_ITEM"; id: string; patch: Partial<LocalChecklistItem> }
  | { type: "DELETE_CHECKLIST_ITEM"; id: string }
  | { type: "ADD_FILE"; file: LocalFileItem }
  | { type: "DELETE_FILE"; name: string }
  | { type: "SET_TIME_TRACKING"; timeTracking: { estimated: number; logged: number } }
  | { type: "SET_VISIBILITY"; visibility: "public" | "private" };

// ── Reducer ──────────────────────────────────────────────────────────────────

export function projectDetailReducer(state: ProjectDetailState, action: ProjectDetailAction): ProjectDetailState {
  switch (action.type) {
    case "SET_PROJECT":
      if (!state) return createInitialState(action.project);
      return { ...state, project: action.project };

    case "RESET_FOR_PROJECT": {
      const p = action.project;
      const persisted = action.persisted;
      return {
        project: p,
        activeTab: "description",
        starred: persisted?.starred ?? false,
        comments: persisted?.comments ?? [],
        activities: persisted?.activities ?? [{
          id: "init-" + p.id,
          type: "created",
          description: `Project "${p.name}" was created`,
          timestamp: new Date().toISOString(),
          userId: "system",
        } as LocalActivity],
        checklist: persisted?.checklist ?? [],
        files: persisted?.files ?? [],
        timeTracking: persisted?.timeTracking ?? { estimated: 0, logged: 0 },
        visibility: persisted?.visibility ?? "public",
      };
    }

    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "TOGGLE_STAR":
      return { ...state, starred: !state.starred };
    case "ADD_COMMENT":
      return { ...state, comments: [action.comment, ...state.comments] };
    case "UPDATE_COMMENT":
      return { ...state, comments: state.comments.map((c) => c.id === action.id ? { ...c, content: action.content, updatedAt: new Date().toISOString() } : c) };
    case "DELETE_COMMENT":
      return { ...state, comments: state.comments.filter((c) => c.id !== action.id) };
    case "ADD_COMMENT_REACTION":
      return {
        ...state,
        comments: state.comments.map((c) => {
          if (c.id !== action.commentId) return c;
          const existing = c.reactions.find((r) => r.emoji === action.emoji && r.userId === action.userId);
          if (existing) return c;
          return { ...c, reactions: [...c.reactions, { emoji: action.emoji, userId: action.userId }] };
        }),
      };
    case "REMOVE_COMMENT_REACTION":
      return {
        ...state,
        comments: state.comments.map((c) => {
          if (c.id !== action.commentId) return c;
          return { ...c, reactions: c.reactions.filter((r) => !(r.emoji === action.emoji && r.userId === action.userId)) };
        }),
      };
    case "ADD_ACTIVITY":
      return { ...state, activities: [action.activity, ...state.activities] };
    case "ADD_CHECKLIST_ITEM":
      return { ...state, checklist: [...state.checklist, action.item] };
    case "UPDATE_CHECKLIST_ITEM":
      return { ...state, checklist: state.checklist.map((i) => i.id === action.id ? { ...i, ...action.patch } : i) };
    case "DELETE_CHECKLIST_ITEM":
      return { ...state, checklist: state.checklist.filter((i) => i.id !== action.id) };
    case "ADD_FILE":
      return { ...state, files: [action.file, ...state.files] };
    case "DELETE_FILE":
      return { ...state, files: state.files.filter((f) => f.name !== action.name) };
    case "SET_TIME_TRACKING":
      return { ...state, timeTracking: action.timeTracking };
    case "SET_VISIBILITY":
      return { ...state, visibility: action.visibility };
    default:
      return state;
  }
}

// ── Initial state factory ────────────────────────────────────────────────────

export function createInitialState(project: Project): ProjectDetailState {
  return {
    project,
    activeTab: "description",
    starred: false,
    comments: [],
    activities: [
      {
        id: "init-" + project.id,
        type: "created",
        description: `Project "${project.name}" was created`,
        timestamp: new Date().toISOString(),
        userId: "system",
      },
    ],
    checklist: [],
    files: [],
    timeTracking: { estimated: 0, logged: 0 },
    visibility: "public",
  };
}

// ── Helper: extract persistable data from state ─────────────────────────────

export function extractPersistedData(state: ProjectDetailState): PersistedData {
  return {
    starred: state.starred,
    comments: state.comments,
    activities: state.activities,
    checklist: state.checklist,
    // Strip blob URLs — they are ephemeral and break after refresh (Issue #7)
    files: state.files.map((f) => ({ ...f, url: undefined })),
    timeTracking: state.timeTracking,
    visibility: state.visibility,
  };
}
