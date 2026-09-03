// Leadership report queries. Everything returned here is plain JSON so the chart components
// (client side) can receive it directly.
import { prisma } from "@/lib/prisma";

export type ReportRange = 30 | 90 | 365;

export type ReportData = {
  range: ReportRange;
  since: string;
  kpis: {
    openPipeline: number;
    weightedPipeline: number;
    openDeals: number;
    wonThisMonth: number;
    wonThisQuarter: number;
    raasMonthly: number;
    raasDeals: number;
    outstandingInvoices: number;
    overdueCount: number;
    overdueAmount: number;
    openTickets: number;
    slaBreaches: number;
  };
  pipelineByStage: { stage: string; count: number; value: number; color: string | null }[];
  wonLostByMonth: { month: string; won: number; lost: number; wonValue: number; lostValue: number }[];
  pipelineByOwner: { owner: string; value: number; count: number }[];
  leadSources: { source: string; count: number }[];
  activityByPerson: { name: string; emails: number; calls: number; meetings: number; notes: number; tasksDone: number; total: number }[];
  service: { weeks: { week: string; opened: number; resolved: number }[]; avgFirstResponseHours: number | null; slaMetPct: number | null; withSla: number };
  marketing: { postsPerWeek: { week: string; posts: number }[]; byCampaign: { campaign: string; deals: number; value: number; won: number }[]; postsPublished: number };
};

function startOfWeek(d: Date): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = r.getUTCDay();
  r.setUTCDate(r.getUTCDate() - ((day + 6) % 7));
  return r;
}
const weekKey = (d: Date) => startOfWeek(d).toISOString().slice(0, 10);
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

function weeksBetween(since: Date, until: Date): string[] {
  const out: string[] = [];
  const cur = startOfWeek(since);
  while (cur <= until) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return out;
}

const SOURCE_LABELS: Record<string, string> = { cold_outreach: "Cold outreach", linkedin: "LinkedIn", referral: "Referral", website: "Website", chatbot: "Website chat", event: "Event", email: "Inbound email", social: "Social media", other: "Other" };

export async function getReportData(range: ReportRange = 90): Promise<ReportData> {
  const now = new Date();
  const since = new Date(now.getTime() - range * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [stages, openDeals, closedDeals, wonDeals, invoices, ticketsOpen, ticketsInRange, contacts, activities, tasksDone, users, targets, campaignDeals] = await Promise.all([
    prisma.pipelineStage.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.deal.findMany({ where: { stage: { isWon: false, isLost: false } }, include: { stage: true, owner: { select: { name: true } } } }),
    prisma.deal.findMany({ where: { OR: [{ wonAt: { gte: twelveMonthsAgo } }, { lostAt: { gte: twelveMonthsAgo } }] }, include: { stage: true } }),
    prisma.deal.findMany({ where: { stage: { isWon: true } }, select: { value: true, monthlyValue: true, wonAt: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] } }, select: { balanceDue: true, dueDate: true, status: true } }),
    prisma.ticket.findMany({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } }, select: { slaDueAt: true, firstResponseAt: true } }),
    prisma.ticket.findMany({ where: { OR: [{ createdAt: { gte: since } }, { resolvedAt: { gte: since } }] }, select: { createdAt: true, resolvedAt: true, firstResponseAt: true, slaDueAt: true } }),
    prisma.contact.groupBy({ by: ["leadSource"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.activity.groupBy({ by: ["actorId", "type"], where: { occurredAt: { gte: thirtyDaysAgo }, actorId: { not: null }, type: { in: ["EMAIL_OUT", "CALL", "MEETING", "NOTE"] } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { status: "DONE", completedAt: { gte: thirtyDaysAgo }, assigneeId: { not: null } }, _count: { _all: true } }),
    prisma.user.findMany({ where: { kind: "STAFF", status: { not: "INACTIVE" } }, select: { id: true, name: true } }),
    prisma.socialPostTarget.findMany({ where: { status: "published", publishedAt: { gte: since } }, select: { publishedAt: true, postId: true } }),
    prisma.deal.findMany({ where: { campaignId: { not: null } }, include: { campaign: { select: { name: true } }, stage: { select: { isWon: true } } } }),
  ]);

  const openPipeline = openDeals.reduce((a, d) => a + Number(d.value), 0);
  const weightedPipeline = openDeals.reduce((a, d) => a + (Number(d.value) * (d.probability ?? d.stage.probability)) / 100, 0);
  const wonThisMonth = wonDeals.filter((d) => d.wonAt && d.wonAt >= monthStart).reduce((a, d) => a + Number(d.value), 0);
  const wonThisQuarter = wonDeals.filter((d) => d.wonAt && d.wonAt >= quarterStart).reduce((a, d) => a + Number(d.value), 0);
  const raasWon = wonDeals.filter((d) => Number(d.monthlyValue) > 0);
  const overdue = invoices.filter((i) => i.status === "OVERDUE" || (i.dueDate && i.dueDate < now));

  const pipelineByStage = stages.filter((s) => !s.isWon && !s.isLost).map((s) => {
    const rows = openDeals.filter((d) => d.stageKey === s.key);
    return { stage: s.label, count: rows.length, value: rows.reduce((a, d) => a + Number(d.value), 0), color: s.color };
  });

  const months: string[] = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  const wonLostByMonth = months.map((m) => {
    const won = closedDeals.filter((d) => d.stage.isWon && d.wonAt && monthKey(d.wonAt) === m);
    const lost = closedDeals.filter((d) => d.stage.isLost && d.lostAt && monthKey(d.lostAt) === m);
    return { month: m, won: won.length, lost: lost.length, wonValue: won.reduce((a, d) => a + Number(d.value), 0), lostValue: lost.reduce((a, d) => a + Number(d.value), 0) };
  });

  const ownerMap = new Map<string, { value: number; count: number }>();
  for (const d of openDeals) {
    const k = d.owner?.name ?? "Unassigned";
    const cur = ownerMap.get(k) ?? { value: 0, count: 0 };
    ownerMap.set(k, { value: cur.value + Number(d.value), count: cur.count + 1 });
  }
  const pipelineByOwner = [...ownerMap.entries()].map(([owner, v]) => ({ owner, ...v })).sort((a, b) => b.value - a.value);

  const sourceRows = contacts.map((c) => ({ source: SOURCE_LABELS[c.leadSource ?? ""] ?? (c.leadSource ? c.leadSource.replace(/_/g, " ") : "Unknown"), count: c._count._all })).sort((a, b) => b.count - a.count);
  const leadSources = sourceRows.length > 7 ? [...sourceRows.slice(0, 6), { source: "Other", count: sourceRows.slice(6).reduce((a, r) => a + r.count, 0) }] : sourceRows;

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const personMap = new Map<string, { emails: number; calls: number; meetings: number; notes: number; tasksDone: number }>();
  const bump = (id: string, key: "emails" | "calls" | "meetings" | "notes" | "tasksDone", n: number) => {
    const cur = personMap.get(id) ?? { emails: 0, calls: 0, meetings: 0, notes: 0, tasksDone: 0 };
    cur[key] += n;
    personMap.set(id, cur);
  };
  for (const a of activities) {
    if (!a.actorId) continue;
    const key = a.type === "EMAIL_OUT" ? "emails" : a.type === "CALL" ? "calls" : a.type === "MEETING" ? "meetings" : "notes";
    bump(a.actorId, key, a._count._all);
  }
  for (const t of tasksDone) if (t.assigneeId) bump(t.assigneeId, "tasksDone", t._count._all);
  const activityByPerson = [...personMap.entries()].filter(([id]) => nameOf.has(id)).map(([id, v]) => ({ name: nameOf.get(id) ?? "Unknown", ...v, total: v.emails + v.calls + v.meetings + v.notes + v.tasksDone })).sort((a, b) => b.total - a.total);

  const weeks = weeksBetween(since, now);
  const serviceWeeks = weeks.map((w) => ({ week: w, opened: ticketsInRange.filter((t) => t.createdAt >= since && weekKey(t.createdAt) === w).length, resolved: ticketsInRange.filter((t) => t.resolvedAt && t.resolvedAt >= since && weekKey(t.resolvedAt) === w).length }));
  const responded = ticketsInRange.filter((t) => t.firstResponseAt);
  const avgFirstResponseHours = responded.length ? responded.reduce((a, t) => a + (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 3600000, 0) / responded.length : null;
  const withSla = ticketsInRange.filter((t) => t.slaDueAt);
  const slaMet = withSla.filter((t) => t.firstResponseAt && t.firstResponseAt <= t.slaDueAt!).length;
  const slaBreaches = ticketsOpen.filter((t) => t.slaDueAt && t.slaDueAt < now && !t.firstResponseAt).length;

  const postIds = new Set<string>();
  const postsPerWeek = weeks.map((w) => ({ week: w, posts: new Set(targets.filter((t) => t.publishedAt && weekKey(t.publishedAt) === w).map((t) => t.postId)).size }));
  for (const t of targets) postIds.add(t.postId);
  const campMap = new Map<string, { deals: number; value: number; won: number }>();
  for (const d of campaignDeals) {
    const k = d.campaign?.name ?? "Unknown campaign";
    const cur = campMap.get(k) ?? { deals: 0, value: 0, won: 0 };
    campMap.set(k, { deals: cur.deals + 1, value: cur.value + Number(d.value), won: cur.won + (d.stage.isWon ? 1 : 0) });
  }

  return {
    range,
    since: since.toISOString(),
    kpis: {
      openPipeline,
      weightedPipeline,
      openDeals: openDeals.length,
      wonThisMonth,
      wonThisQuarter,
      raasMonthly: raasWon.reduce((a, d) => a + Number(d.monthlyValue), 0),
      raasDeals: raasWon.length,
      outstandingInvoices: invoices.reduce((a, i) => a + Number(i.balanceDue), 0),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((a, i) => a + Number(i.balanceDue), 0),
      openTickets: ticketsOpen.length,
      slaBreaches,
    },
    pipelineByStage,
    wonLostByMonth,
    pipelineByOwner,
    leadSources,
    activityByPerson,
    service: { weeks: serviceWeeks, avgFirstResponseHours, slaMetPct: withSla.length ? Math.round((slaMet / withSla.length) * 100) : null, withSla: withSla.length },
    marketing: { postsPerWeek, byCampaign: [...campMap.entries()].map(([campaign, v]) => ({ campaign, ...v })).sort((a, b) => b.value - a.value), postsPublished: postIds.size },
  };
}
