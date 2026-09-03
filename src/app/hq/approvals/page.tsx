import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/empty-state";
import { ApprovalList, type ApprovalRow } from "@/components/hq/approvals/approval-list";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const tab = sp.tab === "history" ? "history" : "pending";
  const canDecide = can(user, "approvals.decide");
  const isOwner = user.tier === "OWNER";
  const base: Prisma.ApprovalWhereInput = canDecide ? {} : { requestedById: user.id };
  const include = { requestedBy: { select: { id: true, name: true, image: true, avatarColor: true } }, decidedBy: { select: { name: true } } } as const;
  const [pending, history] = await Promise.all([
    prisma.approval.findMany({ where: { ...base, status: "PENDING" }, orderBy: { createdAt: "asc" }, include }),
    tab === "history" ? prisma.approval.findMany({ where: { ...base, status: { not: "PENDING" } }, orderBy: { decidedAt: "desc" }, take: 100, include }) : Promise.resolve([]),
  ]);
  const map = (a: (typeof pending)[number]): ApprovalRow => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    reason: a.reason,
    status: a.status,
    entityType: a.entityType,
    entityId: a.entityId,
    requiredTier: a.requiredTier,
    createdAt: a.createdAt.toISOString(),
    decidedAt: a.decidedAt?.toISOString() ?? null,
    decisionNote: a.decisionNote,
    details: (a.details as Record<string, unknown> | null) ?? null,
    requestedBy: a.requestedBy,
    decidedBy: a.decidedBy,
  });
  const ownerWaiting = pending.filter((a) => ["QUOTE_DISCOUNT", "REFUND", "EXPENSE"].includes(a.type) || a.requiredTier === "OWNER").length;

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle={canDecide ? `${pending.length} waiting${ownerWaiting && !isOwner ? `, ${ownerWaiting} need an owner` : ""}. Discounts, refunds and expenses are owner decisions; access requests and posts can be decided by leadership.` : "Requests you have made and where they stand."}
      />
      <div className="mb-4 flex items-center gap-4 border-b border-line">
        {[
          { key: "pending", label: `Waiting (${pending.length})` },
          { key: "history", label: "History" },
        ].map((t) => (
          <Link key={t.key} href={t.key === "pending" ? "/hq/approvals" : "/hq/approvals?tab=history"} className={cn("-mb-px border-b-2 px-0.5 py-2.5 text-sm font-medium transition-colors", tab === t.key ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "pending" ? <ApprovalList rows={pending.map(map)} canDecide={canDecide} isOwner={isOwner} currentUserId={user.id} /> : <ApprovalList rows={history.map(map)} canDecide={canDecide} isOwner={isOwner} currentUserId={user.id} history />}
    </div>
  );
}
