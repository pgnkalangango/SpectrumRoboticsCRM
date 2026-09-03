import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, FileText, Sparkles, CheckSquare, Users, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getTimeline } from "@/lib/timeline";
import { fmtDate, fullName, label, money, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { Timeline } from "@/components/hq/timeline";
import { DealSheetFromUrl } from "@/components/hq/deals/deal-form";
import { DealStageBar, NextStepEditor } from "@/components/hq/deals/deal-stage-bar";
import { TaskListCompact } from "@/components/hq/tasks/task-list-compact";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const d = await prisma.deal.findUnique({
    where: { id },
    include: {
      stage: true,
      company: { select: { id: true, name: true } },
      primaryContact: true,
      owner: { select: { id: true, name: true, image: true, avatarColor: true } },
      contacts: { include: { contact: true } },
      quotes: { orderBy: { updatedAt: "desc" } },
      invoices: { orderBy: { updatedAt: "desc" } },
      tasks: { where: { status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } }, orderBy: [{ dueAt: "asc" }], include: { assignee: { select: { name: true } } } },
      projects: true,
    },
  });
  if (!d) notFound();
  const [stages, timeline] = await Promise.all([prisma.pipelineStage.findMany({ orderBy: { sortOrder: "asc" } }), getTimeline({ dealId: id })]);
  const closed = d.stage.isWon || d.stage.isLost;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Deals", href: "/hq/deals" }, { label: d.name }]} />
      <RecordHeader
        title={d.name}
        badges={
          <>
            <StatusBadge value={d.stageKey} labelOverride={d.stage.label} />
            <Badge>{label(d.dealType)}</Badge>
          </>
        }
        subtitle={
          <>
            {d.company ? (
              <Link href={`/hq/companies/${d.company.id}`} className="hover:text-brand">
                {d.company.name}
              </Link>
            ) : (
              "No company"
            )}
            {d.primaryContact ? (
              <>
                {" · "}
                <Link href={`/hq/contacts/${d.primaryContact.id}`} className="hover:text-brand">
                  {fullName(d.primaryContact)}
                </Link>
              </>
            ) : null}
          </>
        }
        meta={
          <>
            <span className="font-display text-lg font-bold text-ink tabular">
              {money(Number(d.value))}
              {Number(d.monthlyValue) ? <span className="text-sm font-medium text-muted"> + {money(Number(d.monthlyValue))}/mo</span> : null}
            </span>
            <span>{d.probability ?? d.stage.probability}% likely</span>
            {d.expectedCloseDate ? <span>Close {fmtDate(d.expectedCloseDate)}</span> : null}
            {d.owner ? <span className="flex items-center gap-1.5"><Avatar name={d.owner.name} src={d.owner.image} color={d.owner.avatarColor} size={18} /> {d.owner.name}</span> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/assistant?type=deal&id=${d.id}&label=${encodeURIComponent(d.name)}`}>
                <Sparkles /> Ask assistant
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/tasks?new=1&dealId=${d.id}`}>
                <CheckSquare /> Task
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/quotes/new?dealId=${d.id}${d.company ? `&companyId=${d.company.id}` : ""}${d.primaryContactId ? `&contactId=${d.primaryContactId}` : ""}`}>
                <FileText /> Quote
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/hq/deals/${d.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <DealStageBar dealId={d.id} current={d.stageKey} stages={stages.map((s) => ({ key: s.key, label: s.label, probability: s.probability, isWon: s.isWon, isLost: s.isLost, color: s.color }))} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-4">
          {!closed ? (
            <Panel title="Next step">
              <NextStepEditor dealId={d.id} nextStep={d.nextStep} dueAt={d.nextStepDueAt?.toISOString() ?? null} />
            </Panel>
          ) : null}
          {d.lostReason ? (
            <Panel title="Lost reason">
              <p className="text-sm text-ink-2">{d.lostReason}</p>
            </Panel>
          ) : null}
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Channel", value: d.channel ? label(d.channel) : null },
                { label: "Created", value: fmtDate(d.createdAt) },
                { label: "Last activity", value: d.lastActivityAt ? relTime(d.lastActivityAt) : null },
                { label: "Won", value: d.wonAt ? fmtDate(d.wonAt) : null },
                { label: "Tags", value: d.tags.length ? <span className="flex flex-wrap gap-1">{d.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null },
              ]}
            />
          </Panel>
          <Panel title={`People (${d.contacts.length})`}>
            {d.contacts.length === 0 ? (
              <p className="text-sm text-muted">No contacts linked. Edit the deal to set the main contact.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.contacts.map(({ contact, role }) => (
                  <li key={contact.id}>
                    <Link href={`/hq/contacts/${contact.id}`} className="flex items-center gap-2.5 rounded-md p-1 hover:bg-surface-2">
                      <Avatar name={fullName(contact)} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{fullName(contact)}</span>
                        <span className="block truncate text-xs text-muted">{[role === "primary" ? "Main contact" : role, contact.jobTitle].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {d.notes ? (
            <Panel title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{d.notes}</p>
            </Panel>
          ) : null}
        </div>

        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="quotes">Quotes ({d.quotes.length})</TabsTrigger>
            <TabsTrigger value="tasks">Tasks ({d.tasks.length})</TabsTrigger>
            {d.projects.length ? <TabsTrigger value="projects">Install</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="timeline">
            <Timeline items={timeline} context={{ dealId: d.id, companyId: d.companyId, contactId: d.primaryContactId }} currentUserId={user.id} canDeleteAny={user.tier !== "EMPLOYEE"} />
          </TabsContent>
          <TabsContent value="quotes">
            {d.quotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes on this deal yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {d.quotes.map((q) => (
                  <li key={q.id} className="flex items-center gap-3 px-4 py-3">
                    <FileText className="size-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/quotes/${q.id}`} className="font-medium hover:text-brand">
                        {q.number} · {q.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {money(Number(q.total))}
                        {q.sentAt ? ` · sent ${relTime(q.sentAt)}` : ""}
                        {q.viewedAt ? ` · viewed ${relTime(q.viewedAt)}` : ""}
                      </div>
                    </div>
                    <StatusBadge value={q.status} />
                  </li>
                ))}
              </ul>
            )}
            {d.invoices.length ? (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
                {d.invoices.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/invoices/${i.id}`} className="font-medium hover:text-brand">
                        Invoice {i.number}
                      </Link>
                      <div className="text-xs text-muted">{money(Number(i.total))} · {money(Number(i.balanceDue))} open</div>
                    </div>
                    <StatusBadge value={i.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </TabsContent>
          <TabsContent value="tasks">
            <TaskListCompact tasks={d.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, priority: t.priority, status: t.status, assignee: t.assignee?.name ?? null, taskType: t.taskType }))} newHref={`/hq/tasks?new=1&dealId=${d.id}`} />
          </TabsContent>
          <TabsContent value="projects">
            {d.projects.map((p) => (
              <Panel key={p.id} title={p.name}>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {((p.stages as { key: string; title: string; done: boolean }[] | null) ?? []).map((s) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span className={`size-4 rounded border ${s.done ? "border-ok bg-ok" : "border-line-strong"}`} />
                      <span className={s.done ? "text-muted line-through" : ""}>{s.title}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="secondary" size="sm" className="mt-3">
                  <Link href={`/hq/service/sites?company=${d.companyId ?? ""}`}>Open service</Link>
                </Button>
              </Panel>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <DealSheetFromUrl
        stages={stages.map((s) => ({ key: s.key, label: s.label, probability: s.probability }))}
        initial={{
          id: d.id,
          name: d.name,
          value: Number(d.value),
          monthlyValue: Number(d.monthlyValue),
          stageKey: d.stageKey,
          probability: d.probability,
          expectedCloseDate: d.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
          channel: d.channel,
          dealType: d.dealType,
          nextStep: d.nextStep,
          nextStepDueAt: d.nextStepDueAt?.toISOString().slice(0, 10) ?? null,
          tags: d.tags,
          notes: d.notes,
          company: d.company ? { id: d.company.id, label: d.company.name } : null,
          contact: d.primaryContact ? { id: d.primaryContact.id, label: fullName(d.primaryContact) } : null,
          owner: d.owner ? { id: d.owner.id, label: d.owner.name } : null,
        }}
      />
      <span className="sr-only"><Users /><Building2 /></span>
    </div>
  );
}
