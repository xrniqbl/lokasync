import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { InviteMemberModal } from "./modals/InviteMemberModal";
import { ManageTeamModal } from "./modals/ManageTeamModal";
import { MemberProfileModal } from "./modals/MemberProfileModal";
import { useNavigation } from "./NavigationContext";
import * as api from "../utils/api";
import { useLang } from "../i18n";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useRealtimeWorkspace } from "../realtime";

interface Member {
  initials: string;
  name: string;
  role: string;
  status: string;
  tasks: number;
}

interface Team {
  name: string;
  description: string;
  members: Member[];
}


const statusConfig: Record<string, { color: string; labelKey: string }> = {
  online: { color: "#10b981", labelKey: "teamsPage.online" },
  away: { color: "#f59e0b", labelKey: "teamsPage.away" },
  offline: { color: "#404040", labelKey: "teamsPage.offline" },
};
// Fallback mirrors ManageTeamModal's `statusDot[member.status] ?? "#404040"` pattern.
const fallbackStatus = { color: "#404040", labelKey: "teamsPage.offline" };
const statusFor = (status: string) => statusConfig[status] ?? fallbackStatus;

const avatarColors = [
  "bg-indigo-900/60 text-indigo-300",
  "bg-emerald-900/60 text-emerald-300",
  "bg-amber-900/60 text-amber-300",
  "bg-pink-900/60 text-pink-300",
  "bg-blue-900/60 text-blue-300",
  "bg-purple-900/60 text-purple-300",
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "team";

// Stable team identity: the full slug (no first-word truncation, so
// "Design" and "Design Ops" never collide). Keeps the legacy "qa" alias so
// existing Quality Assurance links keep resolving.
export const teamSlug = (name: string) =>
  name.toLowerCase().startsWith("quality") ? "qa" : slugify(name);

// Stable member identity: team + name + initials (initials alone collide).
const memberKey = (teamName: string, m: Member, index: number) =>
  `${teamName}::${m.name}::${m.initials}::${index}`;
const memberSlug = (teamName: string, m: Member) => slugify(`${teamName} ${m.name} ${m.initials}`);

function buildMemberLookup(teams: Team[]) {
  const lookup: Record<string, { member: Member; colorIndex: number; teamName: string }> = {};
  let idx = 0;
  for (const team of teams) {
    const teamStart = idx;
    team.members.forEach((m, i) => {
      // Keyed by stable composite slug; legacy initials key kept as a
      // fallback for old `member-XX` links (first writer wins).
      const slug = memberSlug(team.name, m);
      if (!lookup[slug]) {
        lookup[slug] = { member: m, colorIndex: (teamStart + i) % avatarColors.length, teamName: team.name };
      }
      const legacy = m.initials.toUpperCase();
      if (!lookup[legacy]) {
        lookup[legacy] = { member: m, colorIndex: (teamStart + i) % avatarColors.length, teamName: team.name };
      }
      idx++;
    });
  }
  return lookup;
}

// Legacy team titles predate the workspace-invite API (owner|member only).
const toWorkspaceRole = (title: string): api.WorkspaceRole =>
  title === "Manager" ? "owner" : "member";

export function TeamsPage() {
  const { t } = useLang();
  const { subSection } = useNavigation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [manageTeam, setManageTeam] = useState<Team | null>(null);
  const [selectedMember, setSelectedMember] = useState<{ member: Member; colorIndex: number } | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const { activeWorkspace, isOwner } = useWorkspace();
  // Ref mirror so the navigation effect can depend on subSection only and
  // never reset the user's filter on a background refetch.
  const teamsRef = useRef<Team[]>([]);
  teamsRef.current = teams;
  // Ensures a deep link present on first load resolves once teams arrive,
  // without re-resetting the filter on every later refetch.
  // Ensures a deep link present on first load resolves once teams arrive,
  // without re-resetting the filter on every later refetch.
  const hydratedNavRef = useRef(false);
  // Race guard: only the latest teams fetch may write state.
  const seqRef = useRef(0);

  const loadTeams = async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getTeams();
      if (seq !== seqRef.current) return;
      setTeams(data);
    } catch (e) {
      if (seq !== seqRef.current) return;
      console.error("Failed to load teams:", e);
      setLoadError(e instanceof Error ? e.message : "Failed to load teams");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  useRealtimeWorkspace(activeWorkspace?.id ?? null, (table) => {
    if (table === "teams" || table === "team_members") {
      const seq = ++seqRef.current;
      api.getTeams().then((data) => {
        if (seq !== seqRef.current) return;
        setTeams(data);
        // A refresh landing mid-initial-load still clears the skeleton so a
        // superseded load can never leave loading stuck on.
        setLoading(false);
      }).catch((e) => {
        console.error("Realtime teams refresh error:", e);
      });
    }
  });

  useEffect(() => {
    void loadTeams();
  }, []);

  const resolveSubSection = (section: string, current: Team[]) => {
    const memberLookup = buildMemberLookup(current);
    // Owner-only deep links: stay silent until the workspace resolves
    // (pre-load isOwner=false must not toast at owners), then surface the
    // guard failure once via toast so blocked links aren't a mystery.
    const ownerGuarded = () => {
      if (isOwner) return true;
      if (activeWorkspace) toast.error("Only owners can manage teams");
      return false;
    };
    if (section === "invite") { if (ownerGuarded()) setShowInvite(true); return; }
    // "manage" may carry a team id: "manage/<slug>", "manage:<slug>", "manage-<slug>".
    if (section === "manage" || section.startsWith("manage-") || section.startsWith("manage:") || section.startsWith("manage/")) {
      if (!ownerGuarded()) return;
      const sep = section.startsWith("manage/") ? "manage/" : section.startsWith("manage:") ? "manage:" : section.startsWith("manage-") ? "manage-" : null;
      const idPart = sep ? section.slice(sep.length).trim() : "";
      if (idPart) {
        const found =
          current.find((tm) => tm.name === idPart) ??
          current.find((tm) => teamSlug(tm.name) === idPart.toLowerCase()) ??
          null;
        setManageTeam(found);
      } else {
        setManageTeam(current[0] ?? null);
      }
      return;
    }
    const team = current.find((tm) => teamSlug(tm.name) === section)
      ?? current.find((tm) => tm.name === section);
    if (team) { setTeamFilter(team.name); setSelectedMember(null); return; }
    if (section.startsWith("member-")) {
      const raw = section.slice("member-".length);
      const found = memberLookup[raw.toLowerCase()] ?? memberLookup[raw.toUpperCase()];
      if (found) {
        setTeamFilter(found.teamName);
        setSelectedMember({ member: found.member, colorIndex: found.colorIndex });
      }
      return;
    }
    setTeamFilter(null);
  };

  // Narrow deps: reacts to navigation changes only, never to refetches.
  useEffect(() => {
    resolveSubSection(subSection, teamsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSection, isOwner]);

  // One-time hydration: if a deep link was present before teams loaded,
  // resolve it once teams arrive. Later refetches never touch the filter.
  useEffect(() => {
    if (hydratedNavRef.current || teams.length === 0) return;
    hydratedNavRef.current = true;
    resolveSubSection(subSection, teams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams.length]);

  const visibleTeams = teamFilter ? teams.filter((tm) => tm.name === teamFilter) : teams;

  const totalMembers = teams.reduce((acc, tm) => acc + tm.members.length, 0);
  const memberCount = String(totalMembers);
  const teamCount = String(teams.length);

  let globalMemberIndex = 0;

  return (
    <div className="flex flex-col h-full font-['Lexend:Regular',_sans-serif]">
      {/* Header */}
      <div className="px-4 md:px-6 lg:px-8 pt-6 lg:pt-8 pb-5 lg:pb-6 border-b border-neutral-800/40">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-neutral-50 font-['Lexend:SemiBold',_sans-serif] text-[18px] lg:text-[22px] leading-tight mb-1">{t("teamsPage.teamsTitle")}</h1>
            <p className="text-neutral-500 text-[12px] lg:text-[13px]">
              {t("teamsPage.membersAcrossTeams").replace("{memberCount}", memberCount).replace("{teamCount}", teamCount)}
            </p>
          </div>
          {isOwner && (
            <button
              onClick={() => setShowInvite(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              + {t("teamsPage.inviteMember")}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8">
        {loading ? (
          <div className="space-y-6" aria-label="Loading teams">
            {[0, 1].map((s) => (
              <div key={s}>
                <div className="h-4 w-40 rounded bg-neutral-800/60 animate-pulse mb-2" />
                <div className="h-3 w-64 rounded bg-neutral-800/40 animate-pulse mb-4" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="bg-[#141414] border border-neutral-800/60 rounded-xl p-4 min-h-[120px] animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-neutral-800 mb-3" />
                      <div className="h-3 w-2/3 rounded bg-neutral-800 mb-2" />
                      <div className="h-2.5 w-1/2 rounded bg-neutral-800/70" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="text-center py-16">
            <p className="text-neutral-300 text-[13px] mb-2">Failed to load teams</p>
            <p className="text-neutral-600 text-[12px] mb-4">{loadError}</p>
            <button
              onClick={() => void loadTeams()}
              className="border border-neutral-700 hover:bg-neutral-800 text-neutral-200 text-[12px] px-4 py-2 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-neutral-300 text-[13px] mb-1">No teams yet</p>
            <p className="text-neutral-600 text-[12px] mb-4">Create a workspace team or invite your first member to get started.</p>
            {isOwner && (
              <button
                onClick={() => setShowInvite(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] px-4 py-2 rounded-lg transition-colors"
              >
                + {t("teamsPage.inviteMember")}
              </button>
            )}
          </div>
        ) : visibleTeams.length === 0 ? (
          <div className="text-center py-16 text-neutral-600 text-[13px]">
            No teams match this filter.
            <div className="mt-4">
              <button
                onClick={() => setTeamFilter(null)}
                className="border border-neutral-700 hover:bg-neutral-800 text-neutral-200 text-[12px] px-4 py-2 rounded-lg transition-colors"
              >
                Clear filter
              </button>
            </div>
          </div>
        ) : (
          visibleTeams.map((team) => {
            const teamStartIndex = globalMemberIndex;
            globalMemberIndex += team.members.length;

            return (
              <div key={team.name}>
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div>
                    <h2 className="text-neutral-50 text-[14px] lg:text-[15px] font-['Lexend:SemiBold',_sans-serif] mb-0.5">{team.name}</h2>
                    <p className="text-neutral-500 text-[12px]">{team.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-neutral-600 text-[12px] hidden sm:block">{team.members.length} {t("teamsPage.members").toLowerCase()}</span>
                    {isOwner && (
                      <button
                        onClick={() => setManageTeam(team)}
                        className="border border-neutral-800 hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 text-[12px] px-2.5 py-1 rounded-lg transition-colors"
                      >
                        {t("teamsPage.manage")}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {team.members.map((member, i) => {
                    const colorIdx = (teamStartIndex + i) % avatarColors.length;
                    const sc = statusFor(member.status);
                    return (
                      <div
                        key={memberKey(team.name, member, i)}
                        onClick={() => setSelectedMember({ member, colorIndex: colorIdx })}
                        className="bg-[#141414] border border-neutral-800/60 rounded-xl p-3 lg:p-4 hover:border-neutral-700/60 transition-colors cursor-pointer"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center text-[12px] lg:text-[13px] font-['Lexend:SemiBold',_sans-serif] ${avatarColors[colorIdx]}`}>
                            {member.initials}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.color }} />
                            <span className="text-neutral-600 text-[10px] hidden sm:block">{t(sc.labelKey as any)}</span>
                          </div>
                        </div>
                        <div className="text-neutral-200 text-[12px] lg:text-[13px] leading-tight mb-0.5 truncate">{member.name}</div>
                        <div className="text-neutral-500 text-[11px] lg:text-[12px] mb-3 truncate">{member.role}</div>
                        <div className="flex items-center justify-between pt-3 border-t border-neutral-800/40">
                          <span className="text-neutral-600 text-[11px]">{t("teamsPage.tasks")}</span>
                          <span className="text-neutral-300 text-[12px]">{member.tasks}</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Invite card (owners only) */}
                  {isOwner && (
                    <div
                      onClick={() => setShowInvite(true)}
                      className="bg-[#141414] border border-dashed border-neutral-800 rounded-xl p-3 lg:p-4 flex flex-col items-center justify-center gap-2 hover:border-neutral-700 transition-colors cursor-pointer min-h-[120px] lg:min-h-[140px]"
                    >
                      <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full border border-dashed border-neutral-700 flex items-center justify-center text-neutral-600 text-[16px] lg:text-[18px]">+</div>
                      <span className="text-neutral-600 text-[11px] lg:text-[12px]">{t("teamsPage.invite")}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} teams={teams.map((tm) => tm.name)} onInvite={async (teamName, member) => {
        if (!isOwner) {
          toast.error("Only workspace owners can invite members");
          throw new Error("Only workspace owners can invite members");
        }
        // Match by stable team id (name). Never show success when the team
        // is missing — surface an error instead of silently vanishing.
        const target = teamsRef.current.find((tm) => tm.name === teamName);
        if (!target) {
          toast.error(`Team "${teamName}" not found`);
          throw new Error(`Team "${teamName}" not found`);
        }
        try {
          // Canonical workspace invite first (owner|member only) so the
          // invitee can actually join; legacy team titles (Engineer,
          // Designer, Manager, …) map down to the workspace role.
          if (activeWorkspace) {
            await api.createWorkspaceInvite(activeWorkspace.id, {
              email: member.email,
              role: toWorkspaceRole(member.role),
            });
          }
          const updatedTeam = await api.inviteMember(teamName, member);
          setTeams((prev) => prev.map((tm) => tm.name === teamName ? updatedTeam : tm));
          toast.success(`${member.name} added to ${teamName}`);
        } catch (e) { console.error("Failed to invite member:", e); toast.error("Failed to invite member"); throw e; }
      }} />
      {manageTeam && (
        <ManageTeamModal
          open={!!manageTeam}
          onClose={() => setManageTeam(null)}
          teamName={manageTeam.name}
          members={manageTeam.members}
          onRemove={isOwner ? async (teamName, initials) => {
            await api.removeMember(teamName, initials);
            setTeams((prev) => prev.map((tm) =>
              tm.name === teamName ? { ...tm, members: tm.members.filter((m) => m.initials !== initials) } : tm
            ));
          } : undefined}
        />
      )}
      {selectedMember && (
        <MemberProfileModal
          open={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          member={selectedMember.member}
          colorIndex={selectedMember.colorIndex}
        />
      )}
    </div>
  );
}
