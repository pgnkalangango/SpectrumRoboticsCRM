import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getReportData, type ReportRange } from "@/lib/reports";
import { cn, money } from "@/lib/utils";
import { PageHeader } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/card";
import { Panel } from "@/components/hq/record";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampaignAttributionChart, LeadSourcesDonut, PipelineByOwnerChart, PipelineByStageChart, PostsPerWeekChart, ServiceWeeklyChart, WonLostChart } from "@/components/hq/reports/charts";

export const metadata = { title: "Reports" };

const RANGES: { value: ReportRange; label: string }[] = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "12 months" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireStaff("LEADERSHIP");
  if (!can(user, "reports.view")) redirect("/hq?denied=1");
  const sp = await searchParams;
  const range = (RANGES.some((r) => String(r.value) === sp.range) ? Number(sp.range) : 90) as ReportRange;
  const d = await getReportData(range);
  const k = d.kpis;
  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? "";

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Pipeline, revenue, activity, service and marketing in one place. Pipeline figures are live; period charts follow the range you pick."
        actions={
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            {RANGES.map((r) => (
              <Link key={r.value} href={`/hq/reports?range=${r.value}`} className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", range === r.value ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-muted hover:text-ink")}>
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open pipeline" value={money(k.openPipeline)} sub={`${k.openDeals} open deal${k.openDeals === 1 ? "" : "s"}`} tone="brand" />
        <Stat label="Weighted pipeline" value={money(k.weightedPipeline)} sub="Value times stage probability" />
        <Stat label="Won this month" value={money(k.wonThisMonth)} sub={`${money(k.wonThisQuarter)} this quarter`} tone={k.wonThisMonth ? "ok" : "default"} />
        <Stat label="RaaS monthly recurring" value={money(k.raasMonthly)} sub={`From ${k.raasDeals} won RaaS deal${k.raasDeals === 1 ? "" : "s"}`} />
        <Stat label="Outstanding invoices" value={money(k.outstandingInvoices)} sub="Sent, viewed or partly paid" />
        <Stat label="Overdue invoices" value={k.overdueCount} sub={k.overdueCount ? `${money(k.overdueAmount)} past due` : "Nothing past due"} tone={k.overdueCount ? "bad" : "ok"} />
        <Stat label="Open tickets" value={k.openTickets} sub="Not resolved or closed" tone={k.openTickets ? "warn" : "default"} />
        <Stat label="SLA breaches" value={k.slaBreaches} sub="Open, no first response by the SLA" tone={k.slaBreaches ? "bad" : "ok"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Open pipeline by stage">
          <PipelineByStageChart data={d.pipelineByStage} />
        </Panel>
        <Panel title="Won and lost deals by month, last 12 months">
          <WonLostChart data={d.wonLostByMonth} />
        </Panel>
        <Panel title="Open pipeline by owner">
          <PipelineByOwnerChart data={d.pipelineByOwner} />
        </Panel>
        <Panel title={`Lead sources, contacts added in the last ${rangeLabel}`}>
          <LeadSourcesDonut data={d.leadSources} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Activity per person, last 30 days" padded={false}>
          {d.activityByPerson.length === 0 ? (
            <p className="p-4 text-sm text-muted">No logged activity in the last 30 days.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Emails</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Meetings</TableHead>
                  <TableHead className="text-right">Notes</TableHead>
                  <TableHead className="text-right">Tasks done</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.activityByPerson.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right tabular">{p.emails}</TableCell>
                    <TableCell className="text-right tabular">{p.calls}</TableCell>
                    <TableCell className="text-right tabular">{p.meetings}</TableCell>
                    <TableCell className="text-right tabular">{p.notes}</TableCell>
                    <TableCell className="text-right tabular">{p.tasksDone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <Panel title={`Service, last ${rangeLabel}`}>
          <div className="mb-3 grid grid-cols-3 gap-3">
            <div>
              <div className="eyebrow">First response</div>
              <div className="mt-1 font-display text-xl font-bold tabular text-ink">{d.service.avgFirstResponseHours === null ? "n/a" : `${d.service.avgFirstResponseHours.toFixed(1)} h`}</div>
              <div className="text-[11px] text-muted">average</div>
            </div>
            <div>
              <div className="eyebrow">SLA met</div>
              <div className={cn("mt-1 font-display text-xl font-bold tabular", d.service.slaMetPct === null ? "text-ink" : d.service.slaMetPct >= 90 ? "text-ok" : d.service.slaMetPct >= 70 ? "text-warn" : "text-bad")}>{d.service.slaMetPct === null ? "n/a" : `${d.service.slaMetPct}%`}</div>
              <div className="text-[11px] text-muted">of {d.service.withSla} with an SLA</div>
            </div>
            <div>
              <div className="eyebrow">Opened</div>
              <div className="mt-1 font-display text-xl font-bold tabular text-ink">{d.service.weeks.reduce((a, w) => a + w.opened, 0)}</div>
              <div className="text-[11px] text-muted">{d.service.weeks.reduce((a, w) => a + w.resolved, 0)} resolved</div>
            </div>
          </div>
          <ServiceWeeklyChart data={d.service.weeks} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={`Posts published per week, last ${rangeLabel}`}>
          <PostsPerWeekChart data={d.marketing.postsPerWeek} />
        </Panel>
        <Panel title="Deals attributed by campaign">
          <CampaignAttributionChart data={d.marketing.byCampaign} />
        </Panel>
      </div>
    </div>
  );
}
