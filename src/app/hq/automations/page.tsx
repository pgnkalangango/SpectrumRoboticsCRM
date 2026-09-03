import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Workflow } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { AutomationList, type AutomationRow } from "@/components/hq/automations/automation-list";
import { AutomationSheetFromUrl } from "@/components/hq/automations/automation-sheet";
import { parseActions, parseConditions, parseTrigger } from "@/lib/automations/triggers";

export const metadata = { title: "Automations" };

export default async function AutomationsPage() {
  const user = await requireStaff("LEADERSHIP");
  if (!can(user, "automations.manage")) redirect("/hq?denied=1");
  const [automations, users, departments, stages] = await Promise.all([
    prisma.automation.findMany({ orderBy: [{ createdAt: "asc" }], include: { runs: { orderBy: { startedAt: "desc" }, take: 25 } } }),
    prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.department.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
    prisma.pipelineStage.findMany({ orderBy: { sortOrder: "asc" }, select: { key: true, label: true } }),
  ]);
  const items: AutomationRow[] = automations.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    enabled: a.enabled,
    trigger: parseTrigger(a.trigger),
    conditions: parseConditions(a.conditions),
    actions: parseActions(a.actions),
    lastRunAt: a.lastRunAt?.toISOString() ?? null,
    runCount: a.runCount,
    lastRunStatus: a.runs[0]?.status ?? null,
    runs: a.runs.map((r) => {
      const log = (r.log as { label?: string; actions?: { action: string; result: string; ok: boolean }[]; error?: string } | null) ?? {};
      return { id: r.id, status: r.status, entityType: r.entityType, entityId: r.entityId, label: log.label ?? null, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, actions: log.actions ?? [], error: log.error ?? null };
    }),
  }));
  const on = items.filter((i) => i.enabled).length;
  const cronSet = !!process.env.CRON_SECRET;

  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle={`${on} of ${items.length} turned on. Time based rules run from the cron endpoint every few minutes; event rules fire the moment a ticket is created or a deal changes stage.`}
        actions={
          <Button asChild>
            <Link href="/hq/automations?new=1">
              <Plus /> New automation
            </Link>
          </Button>
        }
      />
      {!cronSet ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft/50 px-4 py-3 text-sm text-ink">
          <Workflow className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <div className="font-semibold">The scheduler is not set up yet.</div>
            <p className="text-ink-2">Add CRON_SECRET to the environment and point your host&apos;s scheduler at <code className="rounded bg-surface-2 px-1 font-mono text-xs">GET /api/cron/automations</code> every 5 to 15 minutes with <code className="rounded bg-surface-2 px-1 font-mono text-xs">Authorization: Bearer &lt;CRON_SECRET&gt;</code>. Until then, use Run now.</p>
          </div>
        </div>
      ) : null}
      <AutomationList items={items} />
      <AutomationSheetFromUrl items={items} users={users.map((u) => ({ value: u.id, label: u.name }))} departments={departments.map((d) => ({ value: d.slug, label: d.name }))} stages={stages.map((s) => ({ value: s.key, label: s.label }))} />
    </div>
  );
}
