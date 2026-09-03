import Link from "next/link";
import { Flag, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtDate, label, money } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { CampaignSheetFromUrl, CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from "@/components/hq/marketing/campaign-sheet";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Campaigns" };

const STATUS_TONE: Record<string, string> = { planned: "PROSPECT", active: "ACTIVE", paused: "PAUSED", completed: "DONE" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.CampaignWhereInput = {
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.type ? { type: sp.type } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const rows = await prisma.campaign.findMany({ where, orderBy: [{ status: "asc" }, { startDate: "desc" }, { name: "asc" }], take: 200, include: { owner: { select: { name: true, image: true, avatarColor: true } }, _count: { select: { posts: true, deals: true } }, deals: { select: { value: true, monthlyValue: true, stage: { select: { isWon: true } } } } } });
  const canDraft = can(user, "social.draft");

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle={`${rows.length} campaign${rows.length === 1 ? "" : "s"}. Group posts and the deals they influence.`}
        actions={
          canDraft ? (
            <Button asChild>
              <Link href="/hq/marketing/campaigns?new=1">
                <Plus /> New campaign
              </Link>
            </Button>
          ) : undefined
        }
      />
      <FilterBar searchPlaceholder="Search campaigns" selects={[{ name: "status", label: "All statuses", options: CAMPAIGN_STATUSES }, { name: "type", label: "All types", options: CAMPAIGN_TYPES }]} />
      {rows.length === 0 ? (
        <EmptyState icon={Flag} title={q || sp.status ? "No campaigns match" : "No campaigns yet"} body="Create a campaign, attach posts to it, and reps attach deals from the deal form. Then this page shows what each campaign brought in." action={canDraft ? <Button asChild><Link href="/hq/marketing/campaigns?new=1"><Plus /> New campaign</Link></Button> : undefined} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Posts</TableHead>
              <TableHead className="text-right">Deals</TableHead>
              <TableHead className="text-right">Attributed value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const value = c.deals.reduce((a, d) => a + Number(d.value), 0);
              const won = c.deals.filter((d) => d.stage.isWon).reduce((a, d) => a + Number(d.value), 0);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/hq/marketing/campaigns/${c.id}`} className="font-medium hover:text-brand">
                      {c.name}
                    </Link>
                    {c.channel ? <div className="text-xs text-muted">{c.channel}</div> : null}
                  </TableCell>
                  <TableCell className="text-ink-2">{label(c.type)}</TableCell>
                  <TableCell>
                    <StatusBadge value={STATUS_TONE[c.status] ?? c.status} labelOverride={label(c.status)} />
                  </TableCell>
                  <TableCell className="text-xs text-ink-2">{c.startDate || c.endDate ? `${fmtDate(c.startDate) || "…"} to ${fmtDate(c.endDate) || "…"}` : <span className="text-faint">Not set</span>}</TableCell>
                  <TableCell>{c.owner ? <span className="flex items-center gap-1.5"><Avatar name={c.owner.name} src={c.owner.image} color={c.owner.avatarColor} size={20} /> <span className="text-xs">{c.owner.name.split(" ")[0]}</span></span> : null}</TableCell>
                  <TableCell className="text-right tabular">{c._count.posts}</TableCell>
                  <TableCell className="text-right tabular">{c._count.deals}</TableCell>
                  <TableCell className="text-right tabular">
                    {money(value)}
                    {won ? <div className="text-[11px] text-ok">{money(won)} won</div> : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <CampaignSheetFromUrl />
    </div>
  );
}
