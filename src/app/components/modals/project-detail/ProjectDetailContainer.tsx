import { logger } from "../../../utils/logger";
import { useReducer, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useLang } from "../../../LangContext";
import { BaseModal } from "../BaseModal";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectSidebar } from "./ProjectSidebar";
import { TabBar } from "./TabBar";
import { DescriptionTab } from "./DescriptionTab";
import { CommentsTab } from "./CommentsTab";
import { ActivityTab } from "./ActivityTab";
import { FilesTab } from "./FilesTab";
import { ChecklistTab } from "./ChecklistTab";
import { SettingsTab } from "./SettingsTab";
import { projectDetailReducer, loadPersistedState, persistState, extractPersistedData, createInitialState } from "./types";
import type { ProjectDetailState, LocalActivity, LocalComment, LocalChecklistItem, LocalFileItem } from "./types";
import type { Project } from "../../../utils/api";
import * as api from "../../../utils/api";
import { useAuth } from "../../../auth/AuthContext";
import { useRealtimeSync } from "../../../hooks/useRealtimeSync";

interface ProjectDetailContainerProps {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  onUpdate?: (id: string, patch: Partial<Project>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const EMPTY_PROJECT: Project = { id: "", name: "", description: "", status: "active", progress: 0, tasks: { total: 0, done: 0 }, team: [], due: "", tags: [] };

function buildInitialState(p: Project): ProjectDetailState {
  if (!p.id) return createInitialState(p);
  const persisted = loadPersistedState(p.id);
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

export function ProjectDetailContainer({ open, onClose, project, onUpdate, onDelete }: ProjectDetailContainerProps) {
  const auth = useAuth();
  const { t } = useLang();
  const [state, dispatch] = useReducer(projectDetailReducer, project ?? EMPTY_PROJECT, buildInitialState);
  const [membersMap, setMembersMap] = useState<Map<string, string>>(new Map());
  const [myRole, setMyRole] = useState("member");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const prevProjectIdRef = useRef<string | null>(null);

  // Current user info from AuthContext
  const currentUser = auth?.profile?.full_name || auth?.user?.email || "You";
  const currentUserId = auth?.user?.id || "anonymous";
  const currentUserInitials = currentUser.split(" ").map((w: string) => w[0]).join("").substring(0, 2).toUpperCase() || "YO";

  // Persist to localStorage on every state change
  useEffect(() => {
    if (state.project.id && open) {
      persistState(state.project.id, extractPersistedData(state));
    }
  }, [state, open]);

  // Reset state when project changes (properly resets all per-project data)
  useEffect(() => {
    if (!project || !open) return;
    if (prevProjectIdRef.current !== project.id) {
      const newState = buildInitialState(project);
      dispatch({ type: "RESET_FOR_PROJECT", project: newState.project, persisted: {
        starred: newState.starred,
        comments: newState.comments,
        activities: newState.activities,
        checklist: newState.checklist,
        files: newState.files,
        timeTracking: newState.timeTracking,
        visibility: newState.visibility,
      }});
      prevProjectIdRef.current = project.id;
    }
  }, [project?.id, open]);

  // Fetch workspace members
  useEffect(() => {
    if (!open) return;
    api.getWorkspaceMembers().then(({ members, my_role }) => {
      const map = new Map<string, string>();
      for (const m of members) if (m.user_id) map.set(m.user_id, m.name || m.email);
      setMembersMap(map);
      setMyRole(my_role);
    }).catch((e) => {
      logger.error("app", "Failed to load workspace members:", e);
    });
  }, [open]);

  // Realtime sync: refresh project data (task counts, progress) while modal is open (Issue #19)
  useRealtimeSync(["tasks", "projects"], () => {
    if (!project?.id || !open) return;
    api.getProjects().then((projects) => {
      const fresh = projects.find((p) => p.id === project.id);
      if (fresh) dispatch({ type: "SET_PROJECT", project: fresh });
    }).catch(() => {});
  }, open);

  // Helper: add activity entry (stable ref via useCallback)
  const addActivity = useCallback((type: LocalActivity["type"], description: string) => {
    dispatch({
      type: "ADD_ACTIVITY",
      activity: {
        id: crypto.randomUUID(),
        type,
        description,
        timestamp: new Date().toISOString(),
        userId: currentUserId,
      } as LocalActivity,
    });
  }, [currentUserId]);

  // Sidebar onUpdate wrapper: activity logging for sidebar field changes (Issue #3)
  // Use ref to avoid stale closure (Issue #5)
  const stateProjectRef = useRef(state.project);
  stateProjectRef.current = state.project;

  const handleSidebarUpdate = useCallback(async (id: string, patch: Partial<Project>) => {
    dispatch({ type: "SET_PROJECT", project: { ...stateProjectRef.current, ...patch } });
    for (const [field, value] of Object.entries(patch)) {
      if (value !== undefined && value !== null) {
        const activityType: LocalActivity["type"] = field === "status" ? "status" : field === "priority" ? "priority" : "updated";
        const label = field === "team" ? `Assignees changed` : `${field.charAt(0).toUpperCase() + field.slice(1)} changed to "${value}"`;
        addActivity(activityType, label);
      }
    }
    try { await onUpdate?.(id, patch); } catch (e) { logger.error("app", "Sidebar save failed:", e); toast.error(t("projectDetail.failedToSave")); }
  }, [onUpdate, addActivity]);

  // Debounced auto-save for project fields
  // Uses stateProjectRef to avoid stale closure during debounce window
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const autoSave = useCallback((patch: Partial<Project>) => {
    const current = stateProjectRef.current;
    if (!current || !onUpdateRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await onUpdateRef.current!(current.id, patch);
      } catch (e) {
        logger.error("app", "Auto-save failed:", e);
        toast.error(t("projectDetail.failedToSaveChanges"));
      }
    }, 300);
  }, []);

  if (!project) return null;

  const handleNameChange = (name: string) => {
    dispatch({ type: "SET_PROJECT", project: { ...state.project, name } });
    autoSave({ name });
    addActivity("updated", `Project renamed to "${name}"`);
  };

  const handleDescriptionChange = (html: string) => {
    dispatch({ type: "SET_PROJECT", project: { ...state.project, description: html } });
    autoSave({ description: html });
  };

  const handleDuplicate = async () => {
    try {
      const dup = await api.createProject({
        name: `${state.project.name} (Copy)`,
        description: state.project.description,
        status: "active",
        progress: 0,
        tasks: { total: 0, done: 0 },
        team: [...state.project.team],
        due: state.project.due,
        tags: [...state.project.tags],
      });
      toast.success(`Project duplicated as "${dup.name}"`);
      addActivity("updated", `Project duplicated`);
    } catch {
      toast.error(t("projectDetail.failedToDuplicate"));
    }
  };

  const handleArchive = async () => {
    try {
      await onUpdate?.(project.id, { status: "paused" });
      addActivity("status", "Project archived");
      toast.success(t("projectDetail.archived"));
      onClose();
    } catch {
      toast.error(t("projectDetail.failedToArchive"));
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete?.(project.id);
      try { localStorage.removeItem("projectDetail_" + project.id); } catch {}
      toast.success(t("projectDetail.deleted"));
      onClose();
    } catch {
      toast.error(t("projectDetail.failedToDelete"));
    }
  };

  // Cross-feature activity logging for comments
  const handleAddComment = (comment: LocalComment) => {
    dispatch({ type: "ADD_COMMENT", comment });
    addActivity("comment", `${currentUser} added a comment`);
  };

  const handleEditComment = (id: string, content: string) => {
    dispatch({ type: "UPDATE_COMMENT", id, content });
    addActivity("comment", `${currentUser} edited a comment`);
  };

  const handleDeleteComment = (id: string) => {
    dispatch({ type: "DELETE_COMMENT", id });
    addActivity("comment", `${currentUser} deleted a comment`);
  };

  // Cross-feature activity logging for checklist + progress sync
  const handleAddChecklistItem = (item: LocalChecklistItem) => {
    dispatch({ type: "ADD_CHECKLIST_ITEM", item });
    addActivity("checklist", `Added checklist item: "${item.text}"`);
  };

  const handleUpdateChecklistItem = (id: string, patch: Partial<LocalChecklistItem>) => {
    dispatch({ type: "UPDATE_CHECKLIST_ITEM", id, patch });
    if (patch.completed !== undefined) {
      const item = state.checklist.find((i: LocalChecklistItem) => i.id === id);
      addActivity("checklist", `${patch.completed ? "Completed" : "Unchecked"}: "${item?.text ?? id}"`);
    }
    // Sync progress to server when checklist changes (Issue #17)
    requestAnimationFrame(() => {
      const newChecklist = state.checklist.map((i) => i.id === id ? { ...i, ...patch } : i);
      const done = newChecklist.filter((i) => i.completed).length + state.project.tasks.done;
      const total = newChecklist.length + state.project.tasks.total;
      const progress = total > 0 ? Math.round((done / total) * 100) : state.project.progress;
      if (progress !== state.project.progress) {
        dispatch({ type: "SET_PROJECT", project: { ...state.project, progress } });
        autoSave({ progress });
      }
    });
  };

  const handleDeleteChecklistItem = (id: string) => {
    const item = state.checklist.find((i: LocalChecklistItem) => i.id === id);
    dispatch({ type: "DELETE_CHECKLIST_ITEM", id });
    addActivity("checklist", `Removed checklist item: "${item?.text ?? id}"`);
  };

  // Cross-feature activity logging for files
  const handleAddFile = (file: LocalFileItem) => {
    dispatch({ type: "ADD_FILE", file });
    addActivity("file", `${currentUser} uploaded "${file.name}"`);
  };

  const handleDeleteFile = (name: string) => {
    dispatch({ type: "DELETE_FILE", name });
    addActivity("file", `${currentUser} removed "${name}"`);
  };

  // Cross-feature activity logging for star
  const handleToggleStar = () => {
    dispatch({ type: "TOGGLE_STAR" });
    addActivity("star", `${currentUser} ${state.starred ? "unstarred" : "starred"} the project`);
  };

  // Cross-feature activity logging for visibility
  const handleVisibilityChange = (v: "public" | "private") => {
    dispatch({ type: "SET_VISIBILITY", visibility: v });
    addActivity("visibility", `Project visibility changed to ${v}`);
  };

  // Cross-feature activity logging for time tracking
  const handleTimeTrackingChange = (tt: { estimated: number; logged: number }) => {
    dispatch({ type: "SET_TIME_TRACKING", timeTracking: tt });
    addActivity("time", `Time tracking updated: ${tt.logged}h logged, ${tt.estimated}h estimated`);
  };

  return (
    <BaseModal open={open} onClose={onClose} width="max-w-[95vw] lg:max-w-5xl" noPadding>
      <div className="flex flex-col lg:flex-row max-h-[85vh] lg:max-h-[80vh]">
        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <ProjectHeader
            name={state.project.name}
            starred={state.starred}
            onNameChange={handleNameChange}
            onToggleStar={handleToggleStar}
            onClose={onClose}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onDelete={handleDelete}
            projectId={project.id}
          />
          <TabBar active={state.activeTab} onChange={(tab) => dispatch({ type: "SET_TAB", tab })} />
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {state.activeTab === "description" && (
              <DescriptionTab
                key={project.id}
                description={state.project.description}
                onChange={handleDescriptionChange}
              />
            )}
            {state.activeTab === "comments" && (
              <CommentsTab
                comments={state.comments}
                membersMap={membersMap}
                onAdd={handleAddComment}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
                onReact={(commentId, emoji) => dispatch({ type: "ADD_COMMENT_REACTION", commentId, emoji, userId: currentUserId })}
                onRemoveReaction={(commentId, emoji) => dispatch({ type: "REMOVE_COMMENT_REACTION", commentId, emoji, userId: currentUserId })}
                currentUserId={currentUserId}
                currentUserName={currentUser}
                currentUserInitials={currentUserInitials}
              />
            )}
            {state.activeTab === "activity" && (
              <ActivityTab activities={state.activities} />
            )}
            {state.activeTab === "files" && (
              <FilesTab
                files={state.files}
                onAdd={handleAddFile}
                onDelete={handleDeleteFile}
              />
            )}
            {state.activeTab === "checklist" && (
              <ChecklistTab
                items={state.checklist}
                onAdd={handleAddChecklistItem}
                onUpdate={handleUpdateChecklistItem}
                onDelete={handleDeleteChecklistItem}
              />
            )}
            {state.activeTab === "settings" && (
              <SettingsTab
                visibility={state.visibility}
                onVisibilityChange={handleVisibilityChange}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onTransfer={async (email) => {
                  try {
                    await api.transferOwnership(email);
                    toast.success(`Ownership transferred to ${email}`);
                    addActivity("updated", `Ownership transferred to ${email}`);
                  } catch (e: unknown) {
                    toast.error((e instanceof Error ? e.message : undefined) || "Failed to transfer ownership");
                  }
                }}
                isAdmin={myRole === "owner" || myRole === "admin"}
              />
            )}
          </div>
        </div>

        {/* Sidebar — desktop only, right column */}
        <div className="hidden lg:block w-[280px] shrink-0 border-l border-neutral-800/60 overflow-y-auto px-4 py-4">
          <ProjectSidebar
            project={state.project}
            checklist={state.checklist}
            timeTracking={state.timeTracking}
            membersMap={membersMap}
            onUpdate={handleSidebarUpdate}
            onTimeTrackingChange={handleTimeTrackingChange}
          />
        </div>

        {/* Sidebar — mobile only, below content */}
        <div className="lg:hidden border-t border-neutral-800/60 px-4 py-4 overflow-y-auto max-h-[40vh]">
          <ProjectSidebar
            project={state.project}
            checklist={state.checklist}
            timeTracking={state.timeTracking}
            membersMap={membersMap}
            onUpdate={handleSidebarUpdate}
            onTimeTrackingChange={handleTimeTrackingChange}
          />
        </div>
      </div>
    </BaseModal>
  );
}
