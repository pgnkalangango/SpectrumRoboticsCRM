import Link from "next/link";
import { Kanban, LayoutList, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { cn, fmtDate, money, relTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { DealBoard } from "@/components/hq/deals/deal-board";
import { DealSheetFromUrl } from "@/components/hq/deals/deal-form";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const pipeline = await getSetting("pipeline");
  const q = sp.q?.trim();
  const stages = await prisma.pipelineStage.findMany({ orderBy: { sortOrder: "asc" } });
  const where: Prisma.DealWhereInput = {
    ...(sp.owner === "me" ? { ownerId: user.id } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    ...(view === "board" && sp.closed !== "1" ? { stage: { isWon: false, isLost: false } } : {}),
    ...(sp.stage ? { stageKey: sp.stage } : {}),
  };
  const deals = await prisma.deal.findMany({ where, orderBy: [{ updatedAt: "desc" }], take: 400, include: { company: { select: { name: true } }, owner: { select: { name: true, image: true, avatarColor: true } }, stage: true } });
  const staleBefore = Date.now() - pipeline.staleDays * 86400000;
  const boardDeals = deals.map((d) => ({
    id: d.id,
    name: d.name,
    companyName: d.company?.name ?? null,
    value: Number(d.value),
    monthlyValue: Number(d.monthlyValue),
    stageKey: d.stageKey,
    owner: d.owner,
    nextStep: d.nextStep,
    nextStepDueAt: d.nextStepDueAt?.toISOString() ?? null,
    lastActivityAt: d.lastActivityAt?.toISOString() ?? null,
    stale: !d.stage.isWon && !d.stage.isLost && (!d.lastActivityAt || d.lastActivityAt.getTime() < staleBefore),
    expectedCloseDate: d.expectedCloseDate?.toISOString() ?? null,
  }));
  const open = deals.filter((d) => !d.stage.isWon && !d.stage.isLost);
  const total = open.reduce((a, d) => a + Number(d.value), 0);
  const weighted = open.reduce((a, d) => a + (Number(d.value) * (d.probability ?? d.stage.probability)) / 100, 0);
  const boardStages = sp.closed === "1" ? stages : stages.filter((s) => !s.isWon && !s.isLost);
  const viewHref = (v: string) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, val]) => val !== undefined) as [string, string][]);
    next.set("view", v);
    return `/hq/deals?${next}`;
  };

  return (
    <div>
      <PageHeader
        title="Deals"
        subtitle={`${open.length} open · ${money(total)} in pipeline · ${money(weighted)} weighted by stage`}
        actions={
          <>
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              <Link href={viewHref("board")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold", view === "board" ? "bg-brand-tint text-brand-deep" : "text-muted hover:text-ink")}>
                <Kanban className="size-3.5" /> Board
              </Link>
              <Link href={viewHref("list")} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold", view === "list" ? "bg-brand-tint text-brand-deep" : "text-muted hover:text-ink")}>
                <LayoutList className="size-3.5" /> List
              </Link>
            </div>
            <Button asChild>
              <Link href="/hq/deals?new=1">
                <Plus /> New deal
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search deals or companies"
        selects={[
          { name: "owner", label: "Everyone's", options: [{ value: "me", label: "Mine" }] },
          ...(view === "list" ? [{ name: "stage", label: "All stages", options: stages.map((s) => ({ value: s.key, label: s.label })) }] : [{ name: "closed", label: "Open only", options: [{ value: "1", label: "Include won and lost" }] }]),
        ]}
      />
      {view === "board" ? (
        <DealBoard stages={boardStages.map((s) => ({ key: s.key, label: s.label, probability: s.probability, isWon: s.isWon, isLost: s.isLost, color: s.color }))} deals={boardDeals} staleDays={pipeline.staleDays} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead>Next step</TableHead>
              <TableHead>Close</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Link href={`/hq/deals/${d.id}`} className="font-medium hover:text-brand">
                    {d.name}
                  </Link>
                </TableCell>
                <TableCell className="text-ink-2">{d.company?.name ?? <span className="text-faint">None</span>}</TableCell>
                <TableCell>
                  <StatusBadge value={d.stageKey} labelOverride={d.stage.label} />
                </TableCell>
                <TableCell className="text-right tabular">{money(Number(d.value))}</TableCell>
                <TableCell className="text-right tabular">{Number(d.monthlyValue) ? money(Number(d.monthlyValue)) : <span className="text-faint">–</span>}</TableCell>
                <TableCell className="max-w-56 truncate text-ink-2">{d.nextStep ?? <span className="text-warn">No next step</span>}</TableCell>
                <TableCell className="text-ink-2">{d.expectedCloseDate ? fmtDate(d.expectedCloseDate) : <span className="text-faint">–</span>}</TableCell>
                <TableCell>{d.owner ? <span className="flex items-center gap-1.5"><Avatar name={d.owner.name} src={d.owner.image} color={d.owner.avatarColor} size={20} /> <span className="text-xs">{d.owner.name.split(" ")[0]}</span></span> : null}</TableCell>
                <TableCell className="text-xs text-muted">{d.lastActivityAt ? relTime(d.lastActivityAt) : "None"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <DealSheetFromUrl stages={stages.map((s) => ({ key: s.key, label: s.label, probability: s.probability }))} />
    </div>
  );
}
