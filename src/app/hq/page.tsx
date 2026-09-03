import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckSquare, FileText, Kanban, LifeBuoy, ShieldCheck, BookOpen, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { cn, fmtDate, money, relTime, label } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { TaskQuickComplete } from "@/components/hq/task-quick-complete";

export const metadata = { title: "My Day" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function MyDayPage() {
  const user = await requireStaff();
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const pipeline = await getSetting("pipeline");
  const staleBefore = new Date(now.getTime() - pipeline.staleDays * 86400000);
  const isLead = can(user, "reports.view");

  const [overdue, today, upcoming, noNextStep, quotesWaiting, approvals, tickets, acks, activity, pipelineTotals, myDealsCount] = await Promise.all([
    prisma.task.findMany({ where: { assigneeId: user.id, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 8, include: { contact: { select: { firstName: true, lastName: true } }, deal: { select: { name: true } } } }),
    prisma.task.findMany({ where: { assigneeId: user.id, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { gte: now, lte: endOfDay } }, orderBy: { dueAt: "asc" }, take: 8, include: { contact: { select: { firstName: true, lastName: true } }, deal: { select: { name: true } } } }),
    prisma.task.findMany({ where: { assigneeId: user.id, status: { in: ["TODO", "IN_PROGRESS"] }, OR: [{ dueAt: null }, { dueAt: { gt: endOfDay } }] }, orderBy: [{ dueAt: "asc" }], take: 5 }),
    prisma.deal.findMany({ where: { ownerId: user.id, stage: { isWon: false, isLost: false }, OR: [{ nextStep: null }, { nextStepDueAt: { lt: now } }, { lastActivityAt: { lt: staleBefore } }, { lastActivityAt: null }] }, orderBy: { updatedAt: "asc" }, take: 6, include: { company: { select: { name: true } }, stage: true } }),
    prisma.quote.findMany({ where: { ownerId: user.id, status: { in: ["SENT", "VIEWED", "PENDING_APPROVAL"] } }, orderBy: { updatedAt: "desc" }, take: 6, include: { company: { select: { name: true } } } }),
    can(user, "approvals.decide") ? prisma.approval.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 5, include: { requestedBy: { select: { name: true } } } }) : Promise.resolve([]),
    prisma.ticket.findMany({ where: { status: { in: ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_OEM"] }, OR: [{ assigneeId: user.id }, { assigneeId: null }] }, orderBy: [{ priority: "desc" }, { slaDueAt: "asc" }], take: 5, include: { company: { select: { name: true } } } }),
    prisma.sop.findMany({ where: { status: "PUBLISHED", requiresAcknowledgment: true, acknowledgments: { none: { userId: user.id } } }, select: { slug: true, title: true, version: true }, take: 5 }),
    prisma.activity.findMany({ orderBy: { occurredAt: "desc" }, take: 8, include: { actor: { select: { name: true, image: true, avatarColor: true } }, contact: { select: { firstName: true, lastName: true } }, company: { select: { name: true } }, deal: { select: { name: true } } } }),
    isLead ? prisma.deal.groupBy({ by: ["stageKey"], where: { stage: { isWon: false, isLost: false } }, _sum: { value: true, monthlyValue: true }, _count: { _all: true } }) : Promise.resolve([]),
    prisma.deal.count({ where: { ownerId: user.id, stage: { isWon: false, isLost: false } } }),
  ]);

  const openPipeline = pipelineTotals.reduce((a, r) => a + Number(r._sum.value ?? 0), 0);
  const openMonthly = pipelineTotals.reduce((a, r) => a + Number(r._sum.monthlyValue ?? 0), 0);
  const openDeals = pipelineTotals.reduce((a, r) => a + r._count._all, 0);
  const firstName = user.name.split(" ")[0];
  const focusCount = overdue.length + today.length + noNextStep.length + quotesWaiting.filter((q) => q.status !== "PENDING_APPROVAL").length;

  return (
    <div>
      <PageHeader
        eyebrow={now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting()}, ${firstName}`}
        subtitle={focusCount === 0 ? "Nothing is overdue and every deal has a next step. Nice." : `${focusCount} thing${focusCount === 1 ? "" : "s"} need your attention today.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/hq/assistant?q=What%20should%20I%20do%20today%3F">
                <Sparkles /> Ask what to do first
              </Link>
            </Button>
            <Button asChild>
              <Link href="/hq/tasks?new=1">
                <CheckSquare /> New task
              </Link>
            </Button>
          </>
        }
      />

      {isLead ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Open pipeline" value={money(openPipeline)} sub={`${openDeals} open deal${openDeals === 1 ? "" : "s"} across the team`} tone="brand" />
          <Stat label="Monthly recurring in pipeline" value={money(openMonthly)} sub="RaaS value if every open deal closes" />
          <Stat label="Quotes waiting" value={quotesWaiting.length} sub="Sent, viewed or pending approval" tone={quotesWaiting.length ? "warn" : "default"} />
          <Stat label="Open tickets" value={tickets.length} sub="Unassigned or assigned to you" tone={tickets.some((t) => t.priority === "CRITICAL") ? "bad" : "default"} />
        </div>
      ) : (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "ok"} />
          <Stat label="Due today" value={today.length} tone={today.length ? "warn" : "default"} />
          <Stat label="My open deals" value={myDealsCount} sub={`${noNextStep.length} need a next step`} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tasks</CardTitle>
                <p className="text-[13px] text-muted">Overdue first, then today.</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/hq/tasks">
                  All tasks <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {overdue.length + today.length === 0 ? (
                <EmptyState compact icon={CheckSquare} title="Nothing due" body="Add a task for anything you promised someone." />
              ) : (
                <ul className="divide-y divide-line">
                  {[...overdue, ...today].map((t) => {
                    const late = t.dueAt && t.dueAt < now;
                    const rel = t.contact ? `${t.contact.firstName} ${t.contact.lastName ?? ""}`.trim() : t.deal?.name;
                    return (
                      <li key={t.id} className="flex items-center gap-3 py-2.5">
                        <TaskQuickComplete id={t.id} />
                        <div className="min-w-0 flex-1">
                          <Link href={`/hq/tasks?open=${t.id}`} className="block truncate text-sm font-medium hover:text-brand">
                            {t.title}
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-muted">
                            <span className={cn(late && "font-semibold text-bad")}>{late ? `Overdue · ${relTime(t.dueAt)}` : `Due ${fmtDate(t.dueAt)}`}</span>
                            {rel ? <span>· {rel}</span> : null}
                            <span className="capitalize">· {t.taskType.replace("_", " ")}</span>
                          </div>
                        </div>
                        <StatusBadge value={t.priority} />
                      </li>
                    );
                  })}
                </ul>
              )}
              {upcoming.length > 0 ? (
                <div className="mt-3 border-t border-line pt-3 text-xs text-muted">
                  Coming up: {upcoming.map((t) => t.title).slice(0, 3).join(" · ")}
                  {upcoming.length > 3 ? ` and ${upcoming.length - 3} more` : ""}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Deals that need a next step</CardTitle>
                <p className="text-[13px] text-muted">No next step, a past due next step, or quiet for {pipeline.staleDays}+ days.</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/hq/deals">
                  Pipeline <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {noNextStep.length === 0 ? (
                <EmptyState compact icon={Kanban} title="Every deal has a next step" />
              ) : (
                <ul className="divide-y divide-line">
                  {noNextStep.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/hq/deals/${d.id}`} className="block truncate text-sm font-medium hover:text-brand">
                          {d.name}
                        </Link>
                        <div className="text-xs text-muted">
                          {d.company?.name ?? "No company"} · {d.stage.label} · {money(Number(d.value))}
                          {Number(d.monthlyValue) ? ` + ${money(Number(d.monthlyValue))}/mo` : ""}
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-warn">
                        <AlertTriangle className="size-3.5" />
                        {!d.nextStep ? "No next step" : d.nextStepDueAt && d.nextStepDueAt < now ? "Next step overdue" : "Gone quiet"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Quotes waiting</CardTitle>
                <p className="text-[13px] text-muted">Sent and not answered, or waiting on approval.</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/hq/quotes">
                  All quotes <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {quotesWaiting.length === 0 ? (
                <EmptyState compact icon={FileText} title="No quotes waiting" />
              ) : (
                <ul className="divide-y divide-line">
                  {quotesWaiting.map((q) => (
                    <li key={q.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/hq/quotes/${q.id}`} className="block truncate text-sm font-medium hover:text-brand">
                          {q.number} · {q.title}
                        </Link>
                        <div className="text-xs text-muted">
                          {q.company?.name ?? ""} · {money(Number(q.total))}
                          {q.sentAt ? ` · sent ${relTime(q.sentAt)}` : ""}
                          {q.viewedAt ? ` · viewed ${relTime(q.viewedAt)}` : ""}
                        </div>
                      </div>
                      <StatusBadge value={q.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {approvals.length > 0 ? (
            <Card className="border-warn/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-warn" /> Waiting on your decision
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/hq/approvals">
                    Review <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-line">
                  {approvals.map((a) => (
                    <li key={a.id} className="py-2">
                      <Link href="/hq/approvals" className="block text-sm font-medium hover:text-brand">
                        {a.subject}
                      </Link>
                      <div className="text-xs text-muted">
                        {label(a.type)}
                        {a.requestedBy ? ` · ${a.requestedBy.name}` : ""} · {relTime(a.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tickets.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LifeBuoy className="size-4 text-brand" /> Service tickets
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/hq/service/tickets">
                    All <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-line">
                  {tickets.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/hq/service/tickets/${t.id}`} className="block truncate text-sm font-medium hover:text-brand">
                          {t.number} · {t.subject}
                        </Link>
                        <div className="text-xs text-muted">
                          {t.company?.name ?? ""}
                          {t.slaDueAt ? ` · SLA ${t.slaDueAt < now ? "breached" : relTime(t.slaDueAt)}` : ""}
                        </div>
                      </div>
                      <StatusBadge value={t.priority} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {acks.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="size-4 text-brand" /> SOPs to read and acknowledge
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1.5">
                  {acks.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/hq/sops/${s.slug}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:border-brand">
                        <span className="truncate font-medium">{s.title}</span>
                        <span className="text-xs text-muted">v{s.version}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-brand" /> Recent activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted">Nothing logged yet. Notes, calls, emails and stage changes show up here.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {activity.map((a) => {
                    const who = a.actor?.name ?? a.actorLabel ?? "System";
                    const about = a.contact ? `${a.contact.firstName} ${a.contact.lastName ?? ""}`.trim() : a.deal?.name ?? a.company?.name;
                    return (
                      <li key={a.id} className="flex gap-2.5">
                        <Avatar name={who} src={a.actor?.image} color={a.actor?.avatarColor} size={26} />
                        <div className="min-w-0 text-[13px]">
                          <span className="font-medium">{who}</span> <span className="text-muted">{label(a.type).toLowerCase()}</span>
                          {a.subject ? <span> · {a.subject}</span> : null}
                          {about ? <span className="text-muted"> · {about}</span> : null}
                          <div className="text-[11px] text-faint">{relTime(a.occurredAt)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
