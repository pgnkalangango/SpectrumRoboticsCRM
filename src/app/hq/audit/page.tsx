import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { label } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import { AuditTable } from "./audit-table";
import { DateRange } from "./date-range";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Audit log" };
const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  if (!can(user, "audit.view")) redirect("/hq?denied=1");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const from = sp.from ? new Date(sp.from) : null;
  const to = sp.to ? new Date(new Date(sp.to).getTime() + 86400000) : null;
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.actor ? { actorId: sp.actor } : {}),
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(from || to ? { createdAt: { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.getTime()) ? { lt: to } : {}) } } : {}),
    ...(q ? { OR: [{ entityId: { contains: q } }, { actorEmail: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, actions, entities, actors] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { actor: { select: { name: true, image: true, avatarColor: true } } } }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, orderBy: { entityType: "asc" } }),
    prisma.user.findMany({ where: { kind: "STAFF" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/audit?${next}`;
  };

  return (
    <div>
      <PageHeader title="Audit log" subtitle={`${total} entr${total === 1 ? "y" : "ies"}. Every sensitive change: permissions, settings, money, access. Click a row to see what changed.`} />
      <FilterBar
        searchPlaceholder="Search record id, email, action"
        selects={[
          { name: "actor", label: "Anyone", options: actors.map((a) => ({ value: a.id, label: a.name })) },
          { name: "action", label: "All actions", options: actions.map((a) => ({ value: a.action, label: label(a.action) })) },
          { name: "entity", label: "All records", options: entities.map((e) => ({ value: e.entityType, label: label(e.entityType) })) },
        ]}
      >
        <DateRange />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing logged for these filters" body="Try widening the date range or clearing a filter." />
      ) : (
        <AuditTable rows={rows.map((r) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, actor: r.actor, actorEmail: r.actorEmail, before: r.before ?? null, after: r.after ?? null, createdAt: r.createdAt.toISOString() }))} />
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
    </div>
  );
}
