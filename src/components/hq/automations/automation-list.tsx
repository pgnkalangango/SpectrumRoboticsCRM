"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, History, Pencil, Play, Workflow, Zap, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { describeActions, describeTrigger, triggerKind, type AutomationAction, type Condition, type Trigger } from "@/lib/automations/triggers";
import { runAutomation, setAutomationEnabled } from "@/server/actions/automations";

export type RunRow = { id: string; status: string; entityType: string | null; entityId: string | null; label: string | null; startedAt: string; finishedAt: string | null; actions: { action: string; result: string; ok: boolean }[]; error: string | null };
export type AutomationRow = { id: string; name: string; description: string | null; enabled: boolean; trigger: Trigger; conditions: Condition[]; actions: AutomationAction[]; lastRunAt: string | null; runCount: number; runs: RunRow[]; lastRunStatus: string | null };

const KIND_META = { time: { label: "Time based", icon: Clock, tone: "info" as const }, event: { label: "On event", icon: Zap, tone: "warn" as const }, schedule: { label: "Scheduled", icon: CalendarClock, tone: "brand" as const } };

function entityHref(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  return { Quote: `/hq/quotes/${id}`, Deal: `/hq/deals/${id}`, Invoice: `/hq/invoices/${id}`, Ticket: `/hq/service/tickets/${id}`, RobotUnit: `/hq/service/robots/${id}` }[type] ?? null;
}

export function AutomationList({ items }: { items: AutomationRow[] }) {
  const router = useRouter();
  const [runsFor, setRunsFor] = React.useState<AutomationRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const toggle = async (a: AutomationRow, enabled: boolean) => {
    setBusy(a.id);
    const r = await setAutomationEnabled(a.id, enabled);
    setBusy(null);
    if (r.ok) {
      toast.success(enabled ? `${a.name} is on` : `${a.name} is paused`);
      router.refresh();
    } else toast.error(r.error);
  };
  const runNow = async (a: AutomationRow) => {
    setBusy(a.id);
    const r = await runAutomation(a.id);
    setBusy(null);
    if (r.ok && r.data) {
      const d = r.data;
      toast.success(d.ran ? `Ran for ${d.ran} record${d.ran === 1 ? "" : "s"}${d.skipped ? `, ${d.skipped} already handled` : ""}${d.errors ? `, ${d.errors} error${d.errors === 1 ? "" : "s"}` : ""}` : d.matched ? `Nothing new. ${d.skipped} record${d.skipped === 1 ? "" : "s"} already handled.` : d.notes[0] ?? "Nothing matched right now.");
      router.refresh();
    } else if (!r.ok) toast.error(r.error);
  };

  if (items.length === 0) return <EmptyState icon={Workflow} title="No automations yet" body="Automations create tasks, notify people and send digests when something happens or on a schedule." action={<Button asChild><Link href="/hq/automations?new=1">New automation</Link></Button>} />;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">On</TableHead>
            <TableHead>Automation</TableHead>
            <TableHead>When</TableHead>
            <TableHead>What happens</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a) => {
            const kind = KIND_META[triggerKind(a.trigger.type)];
            return (
              <TableRow key={a.id} className={cn(!a.enabled && "opacity-60")}>
                <TableCell>
                  <Switch checked={a.enabled} disabled={busy === a.id} onCheckedChange={(v) => toggle(a, v)} aria-label={`Turn ${a.name} ${a.enabled ? "off" : "on"}`} />
                </TableCell>
                <TableCell className="max-w-xs">
                  <Link href={`/hq/automations?edit=${a.id}`} className="font-medium text-ink hover:text-brand">
                    {a.name}
                  </Link>
                  {a.description ? <div className="mt-0.5 line-clamp-2 text-xs text-muted">{a.description}</div> : null}
                </TableCell>
                <TableCell className="max-w-xs">
                  <div className="flex items-start gap-1.5">
                    <Badge variant={kind.tone} className="shrink-0">
                      <kind.icon className="size-3" /> {kind.label}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-ink-2">{describeTrigger(a.trigger)}</div>
                  {a.conditions.length ? <div className="text-[11px] text-muted">Only when {a.conditions.map((c) => `${c.field} is ${c.value}`).join(" and ")}</div> : null}
                </TableCell>
                <TableCell className="max-w-sm text-xs text-ink-2">{describeActions(a.actions) || <span className="text-faint">No actions</span>}</TableCell>
                <TableCell className="text-xs">
                  {a.lastRunAt ? (
                    <span className="flex items-center gap-1.5" title={fmtDateTime(a.lastRunAt)}>
                      <span className={cn("size-2 rounded-full", a.lastRunStatus === "error" ? "bg-bad" : a.lastRunStatus === "ok" ? "bg-ok" : "bg-line-strong")} />
                      {relTime(a.lastRunAt)}
                    </span>
                  ) : (
                    <span className="text-faint">Never</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <button type="button" onClick={() => setRunsFor(a)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular text-ink-2 hover:bg-surface-2 hover:text-brand">
                    <History className="size-3.5" /> {a.runCount}
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => runNow(a)} loading={busy === a.id} title={triggerKind(a.trigger.type) === "event" ? "Event automations run when the event happens" : "Run this automation now"} disabled={triggerKind(a.trigger.type) === "event"}>
                      <Play /> Run now
                    </Button>
                    <Button asChild variant="ghost" size="icon-sm" title="Edit">
                      <Link href={`/hq/automations?edit=${a.id}`}>
                        <Pencil />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Sheet open={!!runsFor} onOpenChange={(o) => !o && setRunsFor(null)}>
        <SheetContent width="max-w-lg">
          <SheetHeader>
            <SheetTitle>Runs: {runsFor?.name}</SheetTitle>
            <SheetDescription>{runsFor ? `${runsFor.runCount} run${runsFor.runCount === 1 ? "" : "s"} in total. Showing the latest ${runsFor.runs.length}.` : ""}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            {runsFor?.runs.length === 0 ? (
              <p className="text-sm text-muted">This automation has not run yet. Time based and scheduled automations run from the cron endpoint; event automations run when the event happens.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {runsFor?.runs.map((r) => {
                  const href = entityHref(r.entityType, r.entityId);
                  return (
                    <li key={r.id} className="rounded-lg border border-line p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge value={r.status === "ok" ? "DONE" : r.status === "error" ? "FAILED" : "CANCELLED"} labelOverride={r.status === "ok" ? "Ran" : r.status === "error" ? "Error" : "Skipped"} />
                        <span className="text-muted" title={fmtDateTime(r.startedAt)}>
                          {relTime(r.startedAt)}
                        </span>
                      </div>
                      <div className="mt-1.5 font-medium text-ink">{href ? <Link href={href} className="hover:text-brand">{r.label ?? `${r.entityType} ${r.entityId}`}</Link> : r.label ?? r.entityType ?? "Run"}</div>
                      {r.error ? <div className="mt-1 text-bad">{r.error}</div> : null}
                      {r.actions.length ? (
                        <ul className="mt-1.5 flex flex-col gap-0.5 text-ink-2">
                          {r.actions.map((x, i) => (
                            <li key={i} className="flex gap-1.5">
                              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", x.ok ? "bg-ok" : "bg-bad")} />
                              <span>
                                <span className="font-semibold">{x.action.replace(/_/g, " ")}:</span> {x.result}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
