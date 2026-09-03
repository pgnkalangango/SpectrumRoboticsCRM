import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, LifeBuoy, BookOpen, CheckSquare, Bot, MapPin, Building2, Lock, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getTimeline } from "@/lib/timeline";
import { fmtDateTime, fullName, label, relTime } from "@/lib/utils";
import { robotLabel } from "@/lib/service";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { Timeline } from "@/components/hq/timeline";
import { TaskListCompact } from "@/components/hq/tasks/task-list-compact";
import { TicketSheetFromUrl } from "@/components/hq/service/ticket-form";
import { TicketStatusBar } from "@/components/hq/service/ticket-status-bar";
import { TicketAssign } from "@/components/hq/service/ticket-assign";
import { TicketComments, type CommentItem } from "@/components/hq/service/ticket-comments";
import { SlaBadge } from "@/components/hq/service/sla-badge";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const t = await prisma.ticket.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      site: { select: { id: true, name: true, addressCity: true, addressState: true } },
      robotUnit: { select: { id: true, serialNumber: true, modelName: true, oem: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phoneMobile: true, user: { select: { id: true, status: true } } } },
      assignee: { select: { id: true, name: true, image: true, avatarColor: true } },
      createdBy: { select: { id: true, name: true, kind: true } },
      comments: { orderBy: { createdAt: "desc" }, include: { author: { select: { id: true, name: true, image: true, avatarColor: true, kind: true } } } },
      tasks: { where: { status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } }, orderBy: [{ dueAt: "asc" }], include: { assignee: { select: { name: true } } } },
    },
  });
  if (!t) notFound();
  const timeline = await getTimeline({ ticketId: id });
  const canManage = can(user, "tickets.manage");
  const comments: CommentItem[] = t.comments.map((c) => ({ id: c.id, body: c.body, internal: c.internal, createdAt: c.createdAt.toISOString(), author: c.author ? { id: c.author.id, name: c.author.name, image: c.author.image, avatarColor: c.author.avatarColor, kind: c.author.kind } : null }));
  const contactName = t.contact ? fullName(t.contact) : null;
  const portalUser = t.contact?.user?.status === "ACTIVE";

  return (
    <div>
      <Breadcrumbs items={[{ label: "Tickets", href: "/hq/service/tickets" }, { label: t.number }]} />
      <RecordHeader
        avatar={
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep dark:text-brand-bright">
            <LifeBuoy className="size-6" />
          </div>
        }
        title={
          <>
            <span className="font-mono text-muted">{t.number}</span> {t.subject}
          </>
        }
        badges={
          <>
            <StatusBadge value={t.priority} />
            <StatusBadge value={t.status} />
            <Badge>{label(t.category)}</Badge>
            {t.clientVisible ? <Badge variant="brand">Client can see</Badge> : <Badge><Lock className="size-3" /> Hidden from client</Badge>}
          </>
        }
        subtitle={[t.company?.name, t.site?.name, t.robotUnit ? robotLabel(t.robotUnit) : null].filter(Boolean).join(" · ") || "Not linked to a company yet"}
        meta={
          <>
            <span>Opened {relTime(t.createdAt)}{t.createdBy ? ` by ${t.createdBy.name}${t.createdBy.kind === "CLIENT" ? " (portal)" : ""}` : ""}</span>
            <SlaBadge slaDueAt={t.slaDueAt} status={t.status} firstResponseAt={t.firstResponseAt} resolvedAt={t.resolvedAt} />
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/assistant?type=ticket&id=${t.id}&label=${encodeURIComponent(`${t.number} ${t.subject}`)}`}>
                <Sparkles /> Ask assistant
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href="/hq/sops/service-ticket-handling-and-sla">
                <BookOpen /> SOP
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/tasks?new=1&ticketId=${t.id}${t.company ? `&companyId=${t.company.id}&companyName=${encodeURIComponent(t.company.name)}` : ""}${t.contact ? `&contactId=${t.contact.id}&contactName=${encodeURIComponent(contactName ?? "")}` : ""}`}>
                <CheckSquare /> Task
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/hq/service/tickets/${t.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </Button>
          </>
        }
      />

      {canManage ? <TicketStatusBar ticketId={t.id} current={t.status} hasResolution={!!t.resolution} /> : null}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Assigned to">
            {canManage ? <TicketAssign key={t.assignee?.id ?? "none"} ticketId={t.id} assignee={t.assignee ? { id: t.assignee.id, label: t.assignee.name } : null} /> : t.assignee ? <span className="flex items-center gap-1.5 text-sm"><Avatar name={t.assignee.name} src={t.assignee.image} color={t.assignee.avatarColor} size={20} /> {t.assignee.name}</span> : <span className="text-sm text-muted">Unassigned</span>}
            {!t.assignee ? <p className="mt-2 text-xs text-warn">Nobody owns this ticket yet. Assign it so the SLA has a name on it.</p> : null}
          </Panel>
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Company", value: t.company ? <Link href={`/hq/companies/${t.company.id}`} className="flex items-center gap-1 text-brand hover:underline"><Building2 className="size-3.5" /> {t.company.name}</Link> : null },
                { label: "Site", value: t.site ? <Link href={`/hq/service/sites/${t.site.id}`} className="flex items-center gap-1 text-brand hover:underline"><MapPin className="size-3.5" /> {t.site.name}</Link> : null },
                { label: "Robot", value: t.robotUnit ? <Link href={`/hq/service/robots/${t.robotUnit.id}`} className="flex items-center gap-1 text-brand hover:underline"><Bot className="size-3.5" /> {robotLabel(t.robotUnit)}</Link> : null },
                { label: "Customer contact", value: t.contact ? <span><Link href={`/hq/contacts/${t.contact.id}`} className="text-brand hover:underline">{contactName}</Link>{t.contact.email ? <span className="block text-xs text-muted">{t.contact.email}</span> : null}{portalUser ? <span className="block text-xs text-ok">Has portal access, gets reply notifications</span> : t.clientVisible ? <span className="block text-xs text-muted">No portal login yet</span> : null}</span> : null },
                { label: "Category", value: label(t.category) },
                { label: "SLA due", value: t.slaDueAt ? fmtDateTime(t.slaDueAt) : null },
                { label: "First response", value: t.firstResponseAt ? fmtDateTime(t.firstResponseAt) : <span className="text-warn">Not yet</span> },
                { label: "Resolved", value: t.resolvedAt ? fmtDateTime(t.resolvedAt) : null },
                { label: "Closed", value: t.closedAt ? fmtDateTime(t.closedAt) : null },
                { label: "Opened by", value: t.createdBy ? `${t.createdBy.name}${t.createdBy.kind === "CLIENT" ? " (client portal)" : ""}` : null },
              ]}
            />
          </Panel>
          {t.description ? (
            <Panel title="What is happening">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{t.description}</p>
            </Panel>
          ) : null}
          {t.resolution ? (
            <Panel title="Resolution">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{t.resolution}</p>
            </Panel>
          ) : null}
        </div>

        <Tabs defaultValue={sp.tab ?? "conversation"}>
          <TabsList>
            <TabsTrigger value="conversation">
              Conversation <span className="rounded bg-surface-2 px-1 text-[10px]">{t.comments.length}</span>
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks <span className="rounded bg-surface-2 px-1 text-[10px]">{t.tasks.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="conversation">
            <TicketComments ticketId={t.id} comments={comments} clientVisible={t.clientVisible} contactName={contactName} />
          </TabsContent>
          <TabsContent value="timeline">
            <Timeline items={timeline} context={{ ticketId: t.id, companyId: t.company?.id ?? null, siteId: t.site?.id ?? null, contactId: t.contact?.id ?? null }} currentUserId={user.id} canDeleteAny={user.tier !== "EMPLOYEE"} />
          </TabsContent>
          <TabsContent value="tasks">
            <TaskListCompact tasks={t.tasks.map((x) => ({ id: x.id, title: x.title, dueAt: x.dueAt?.toISOString() ?? null, priority: x.priority, status: x.status, assignee: x.assignee?.name ?? null, taskType: x.taskType }))} newHref={`/hq/tasks?new=1&ticketId=${t.id}${t.company ? `&companyId=${t.company.id}&companyName=${encodeURIComponent(t.company.name)}` : ""}`} />
          </TabsContent>
        </Tabs>
      </div>

      <TicketSheetFromUrl
        initial={{
          id: t.id,
          subject: t.subject,
          description: t.description,
          category: t.category,
          priority: t.priority,
          clientVisible: t.clientVisible,
          company: t.company ? { id: t.company.id, label: t.company.name } : null,
          site: t.site ? { id: t.site.id, label: t.site.name } : null,
          robot: t.robotUnit ? { id: t.robotUnit.id, label: robotLabel(t.robotUnit) } : null,
          contact: t.contact ? { id: t.contact.id, label: contactName ?? "" } : null,
          assignee: t.assignee ? { id: t.assignee.id, label: t.assignee.name } : null,
        }}
      />
    </div>
  );
}
