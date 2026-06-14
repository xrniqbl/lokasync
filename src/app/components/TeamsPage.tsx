import { useState, useEffect } from "react";
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

const avatarColors = [
  "bg-indigo-900/60 text-indigo-300",
  "bg-emerald-900/60 text-emerald-300",
  "bg-amber-900/60 text-amber-300",
  "bg-pink-900/60 text-pink-300",
  "bg-blue-900/60 text-blue-300",
  "bg-purple-900/60 text-purple-300",
];

function buildMemberLookup(teams: Team[]) {
  const lookup: Record<string, { member: Member; colorIndex: number; teamName: string }> = {};
  let idx = 0;
  for (const team of teams) {
    const teamStart = idx;
    team.members.forEach((m, i) => {
      lookup[m.initials] = { member: m, colorIndex: (teamStart + i) % avatarColors.length, teamName: team.name };
      idx++;
    });
  }
  return lookup;
}

// Slug used by sidebar team links (must match SidebarDemo's teamSlug)
export const teamSlug = (name: string) =>
  name.toLowerCase().startsWith("quality") ? "qa" : name.split(" ")[0].toLowerCase();

export function TeamsPage() {
  const { t } = useLang();
  const { subSection } = useNavigation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [manageTeam, setManageTeam] = useState<Team | null>(null);
  const [selectedMember, setSelectedMember] = useState<{ member: Member; colorIndex: number } | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const { activeWorkspace } = useWorkspace();
  useRealtimeWorkspace(activeWorkspace?.id ?? null, (table) => {
    if (table === "teams" || table === "team_members") {
      api.getTeams().then((data) => setTeams(data)).catch((e) => {
        console.log("Realtime teams refresh error:", e);
      });
    }
  });

  useEffect(() => {
    api.getTeams().then((data) => setTeams(data)).catch((e) => {
      console.log("Failed to load teams:", e);
      toast.error("Failed to load teams");
    });
  }, []);

  useEffect(() => {
    const memberLookup = buildMemberLookup(teams);
    if (subSection === "invite") { setShowInvite(true); return; }
    if (subSection === "manage") { setManageTeam(teams[0] ?? null); return; }
    const team = teams.find((t) => teamSlug(t.name) === subSection);
    if (team) { setTeamFilter(team.name); setSelectedMember(null); return; }
    if (subSection.startsWith("member-")) {
      const initials = subSection.slice("member-".length).toUpperCase();
      const found = memberLookup[initials];
      if (found) {
        setTeamFilter(found.teamName);
        setSelectedMember({ member: found.member, colorIndex: found.colorIndex });
      }
      return;
    }
    setTeamFilter(null);
  }, [subSection, teams]);

  const visibleTeams = teamFilter ? teams.filter((t) => t.name === teamFilter) : teams;

  const totalMembers = teams.reduce((acc, t) => acc + t.members.length, 0);
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
          <button
            onClick={() => setShowInvite(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            + {t("teamsPage.inviteMember")}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8">
        {visibleTeams.map((team) => {
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
                  <button
                    onClick={() => setManageTeam(team)}
                    className="border border-neutral-800 hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 text-[12px] px-2.5 py-1 rounded-lg transition-colors"
                  >
                    {t("teamsPage.manage")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {team.members.map((member, i) => {
                  const colorIdx = (teamStartIndex + i) % avatarColors.length;
                  return (
                    <div
                      key={member.initials}
                      onClick={() => setSelectedMember({ member, colorIndex: colorIdx })}
                      className="bg-[#141414] border border-neutral-800/60 rounded-xl p-3 lg:p-4 hover:border-neutral-700/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-full flex items-center justify-center text-[12px] lg:text-[13px] font-['Lexend:SemiBold',_sans-serif] ${avatarColors[colorIdx]}`}>
                          {member.initials}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusConfig[member.status].color }} />
                          <span className="text-neutral-600 text-[10px] hidden sm:block">{t(statusConfig[member.status].labelKey as any)}</span>
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

                {/* Invite card */}
                <div
                  onClick={() => setShowInvite(true)}
                  className="bg-[#141414] border border-dashed border-neutral-800 rounded-xl p-3 lg:p-4 flex flex-col items-center justify-center gap-2 hover:border-neutral-700 transition-colors cursor-pointer min-h-[120px] lg:min-h-[140px]"
                >
                  <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full border border-dashed border-neutral-700 flex items-center justify-center text-neutral-600 text-[16px] lg:text-[18px]">+</div>
                  <span className="text-neutral-600 text-[11px] lg:text-[12px]">{t("teamsPage.invite")}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <InviteMemberModal open={showInvite} onClose={() => setShowInvite(false)} onInvite={async (teamName, member) => {
        try {
          const updatedTeam = await api.inviteMember(teamName, member);
          setTeams((prev) => prev.map((t) => t.name === teamName ? updatedTeam : t));
          toast.success(`${member.name} added to ${teamName}`);
        } catch (e) { console.log("Failed to invite member:", e); toast.error("Failed to invite member"); }
      }} />
      {manageTeam && (
        <ManageTeamModal
          open={!!manageTeam}
          onClose={() => setManageTeam(null)}
          teamName={manageTeam.name}
          members={manageTeam.members}
          onRemove={async (teamName, initials) => {
            await api.removeMember(teamName, initials);
            setTeams((prev) => prev.map((t) =>
              t.name === teamName ? { ...t, members: t.members.filter((m) => m.initials !== initials) } : t
            ));
          }}
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