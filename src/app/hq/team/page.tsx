import Link from "next/link";
import { Plus, UserCog } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can, ROLE_LABELS, TIER_LABELS } from "@/lib/permissions";
import { cn, isOverdue, relTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { TeamMemberSheetFromUrl, type TeamMemberInitial } from "@/components/hq/team/team-member-sheet";

export const metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const user = await requireStaff("LEADERSHIP");
  const sp = await searchParams;
  const canManage = can(user, "team.manage");
  const [members, departments] = await Promise.all([
    prisma.user.findMany({ where: { kind: "STAFF" }, orderBy: [{ status: "asc" }, { name: "asc" }], include: { department: { select: { id: true, name: true, color: true, sortOrder: true } }, manager: { select: { id: true, name: true } } } }),
    prisma.department.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  const invitedEmails = members.filter((m) => m.status === "INVITED").map((m) => m.email);
  const invitations = invitedEmails.length ? await prisma.invitation.findMany({ where: { email: { in: invitedEmails }, acceptedAt: null }, orderBy: { createdAt: "desc" } }) : [];
  const latestInvite = (email: string) => invitations.find((i) => i.email === email);

  const groups = [...departments.map((d) => ({ key: d.id, name: d.name, color: d.color, items: members.filter((m) => m.departmentId === d.id) })), { key: "none", name: "No department", color: "#9AA4AB", items: members.filter((m) => !m.departmentId) }].filter((g) => g.items.length > 0);
  const active = members.filter((m) => m.status === "ACTIVE").length;
  const invited = members.filter((m) => m.status === "INVITED").length;

  const editing = sp.edit ? members.find((m) => m.id === sp.edit) : undefined;
  const initial: TeamMemberInitial | undefined = editing
    ? {
        id: editing.id,
        name: editing.name,
        email: editing.email,
        tier: editing.tier,
        status: editing.status,
        roleLabel: editing.roleLabel,
        departmentId: editing.departmentId,
        title: editing.title,
        manager: editing.manager ? { id: editing.manager.id, label: editing.manager.name } : null,
        territory: editing.territory,
        bookingLink: editing.bookingLink,
        phone: editing.phone,
        approvalLimitPct: editing.approvalLimitPct,
        permissions: editing.permissions,
        lastSeenAt: editing.lastSeenAt?.toISOString() ?? null,
        createdAt: editing.createdAt.toISOString(),
        invitedAt: latestInvite(editing.email)?.createdAt.toISOString() ?? null,
      }
    : undefined;

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={`${active} active · ${invited} invited · ${members.length - active - invited} inactive. ${canManage ? "Add people, set their access level and permissions." : "Owners add people and change access."}`}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/hq/team?new=1">
                <Plus /> Add team member
              </Link>
            </Button>
          ) : undefined
        }
      />
      {members.length === 0 ? (
        <EmptyState icon={UserCog} title="No team members yet" body="Invite the first person and they get an email to choose a password." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: g.color }} />
                <h2 className="font-display text-[15px] font-semibold text-ink">{g.name}</h2>
                <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">{g.items.length}</span>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                {g.items.map((m) => {
                  const inv = m.status === "INVITED" ? latestInvite(m.email) : undefined;
                  const expired = inv ? isOverdue(inv.expiresAt) : false;
                  const row = (
                    <div className={cn("flex items-center gap-3 px-4 py-3", m.status === "INACTIVE" && "opacity-60")}>
                      <Avatar name={m.name} src={m.image} color={m.avatarColor} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-ink">{m.name}</span>
                          {m.id === user.id ? <Badge>You</Badge> : null}
                          <StatusBadge value={m.tier} labelOverride={TIER_LABELS[m.tier]} />
                          {m.status !== "ACTIVE" ? <StatusBadge value={m.status} /> : null}
                        </div>
                        <div className="truncate text-xs text-muted">
                          {[m.title, ROLE_LABELS[m.roleLabel] ?? m.roleLabel, m.email].filter(Boolean).join(" · ")}
                          {m.manager ? ` · reports to ${m.manager.name.split(" ")[0]}` : ""}
                        </div>
                      </div>
                      <div className="hidden shrink-0 text-right text-xs text-muted sm:block">
                        {m.status === "INVITED" ? (
                          <span className={cn(expired && "text-warn")}>{inv ? (expired ? `Invitation expired ${relTime(inv.expiresAt)}` : `Invited ${relTime(inv.createdAt)}`) : "Invitation pending"}</span>
                        ) : m.lastSeenAt ? (
                          `Seen ${relTime(m.lastSeenAt)}`
                        ) : (
                          "Never signed in"
                        )}
                        {m.territory ? <div className="text-faint">{m.territory}</div> : null}
                      </div>
                    </div>
                  );
                  return (
                    <li key={m.id}>
                      {canManage ? (
                        <Link href={`/hq/team?edit=${m.id}`} className="block transition-colors hover:bg-surface-2/60">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {canManage ? <TeamMemberSheetFromUrl initial={initial} departments={departments} actor={{ id: user.id, tier: user.tier }} /> : null}
    </div>
  );
}
