import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Pencil, Kanban, FileText, CheckSquare, Sparkles, MapPin } from "lucide-react";
import { LinkedinIcon } from "@/components/hq/icons";
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
import { ContactSheetFromUrl } from "@/components/hq/contacts/contact-sheet-url";
import { ConvertToDealButton } from "@/components/hq/contacts/convert-button";
import { TaskListCompact } from "@/components/hq/tasks/task-list-compact";

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const c = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, industry: true, addressCity: true, addressState: true } },
      owner: { select: { id: true, name: true, image: true, avatarColor: true } },
      deals: { include: { deal: { include: { stage: true } } } },
      quotes: { orderBy: { updatedAt: "desc" }, take: 10 },
      tickets: { orderBy: { updatedAt: "desc" }, take: 10 },
      tasks: { where: { status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } }, orderBy: [{ dueAt: "asc" }], include: { assignee: { select: { name: true } } } },
      user: { select: { id: true, status: true, lastSeenAt: true } },
    },
  });
  if (!c) notFound();
  const timeline = await getTimeline({ OR: [{ contactId: id }, ...(c.company ? [{ companyId: c.company.id, contactId: null }] : [])] });
  const name = fullName(c);
  const openDeals = c.deals.map((d) => d.deal).filter((d) => !d.stage.isWon && !d.stage.isLost);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Contacts", href: "/hq/contacts" }, { label: name }]} />
      <RecordHeader
        avatar={<Avatar name={name} size={56} />}
        title={name}
        badges={
          <>
            <StatusBadge value={c.type} />
            {c.doNotContact ? <StatusBadge value="DENIED" labelOverride="Do not contact" /> : null}
            {c.user ? <Badge variant="brand">Portal {c.user.status === "ACTIVE" ? "user" : c.user.status.toLowerCase()}</Badge> : null}
          </>
        }
        subtitle={[c.jobTitle, c.company?.name ?? c.companyName].filter(Boolean).join(" at ")}
        meta={
          <>
            {c.email ? <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-brand"><Mail className="size-3.5" /> {c.email}</a> : null}
            {c.phoneMobile ? <a href={`tel:${c.phoneMobile}`} className="flex items-center gap-1 hover:text-brand"><Phone className="size-3.5" /> {c.phoneMobile}</a> : null}
            {c.phoneOffice && !c.phoneMobile ? <a href={`tel:${c.phoneOffice}`} className="flex items-center gap-1 hover:text-brand"><Phone className="size-3.5" /> {c.phoneOffice}</a> : null}
            {c.linkedinUrl ? <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand"><LinkedinIcon className="size-3.5" /> LinkedIn</a> : null}
            {c.addressCity ? <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {[c.addressCity, c.addressState].filter(Boolean).join(", ")}</span> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/assistant?type=contact&id=${c.id}&label=${encodeURIComponent(name)}`}>
                <Sparkles /> Ask assistant
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/tasks?new=1&contactId=${c.id}`}>
                <CheckSquare /> Task
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/quotes/new?contactId=${c.id}${c.company ? `&companyId=${c.company.id}` : ""}`}>
                <FileText /> Quote
              </Link>
            </Button>
            {openDeals.length === 0 ? <ConvertToDealButton contactId={c.id} /> : null}
            <Button asChild size="sm">
              <Link href={`/hq/contacts/${c.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Owner", value: c.owner ? <span className="flex items-center gap-1.5"><Avatar name={c.owner.name} src={c.owner.image} color={c.owner.avatarColor} size={18} /> {c.owner.name}</span> : null },
                { label: "Source", value: c.leadSource ? label(c.leadSource) : null },
                { label: "Company", value: c.company ? <Link href={`/hq/companies/${c.company.id}`} className="text-brand hover:underline">{c.company.name}</Link> : c.companyName },
                { label: "Secondary email", value: c.emailSecondary },
                { label: "Office phone", value: c.phoneOffice },
                { label: "Address", value: [c.addressStreet, c.addressCity, c.addressState, c.addressZip].filter(Boolean).join(", ") },
                { label: "Tags", value: c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null },
                { label: "Last contacted", value: c.lastContactedAt ? relTime(c.lastContactedAt) : null },
                { label: "Last heard from", value: c.lastHeardFromAt ? relTime(c.lastHeardFromAt) : null },
                { label: "Added", value: fmtDate(c.createdAt) },
              ]}
            />
          </Panel>
          {c.notes ? (
            <Panel title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{c.notes}</p>
            </Panel>
          ) : null}
          {c.researchBrief ? (
            <Panel title="Research brief">
              <pre className="whitespace-pre-wrap font-sans text-sm text-ink-2">{typeof c.researchBrief === "string" ? c.researchBrief : JSON.stringify(c.researchBrief, null, 2)}</pre>
            </Panel>
          ) : null}
        </div>

        <Tabs defaultValue={sp.tab ?? "timeline"}>
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="deals">
              Deals <span className="rounded bg-surface-2 px-1 text-[10px]">{c.deals.length}</span>
            </TabsTrigger>
            <TabsTrigger value="quotes">
              Quotes <span className="rounded bg-surface-2 px-1 text-[10px]">{c.quotes.length}</span>
            </TabsTrigger>
            <TabsTrigger value="tasks">
              Tasks <span className="rounded bg-surface-2 px-1 text-[10px]">{c.tasks.length}</span>
            </TabsTrigger>
            <TabsTrigger value="tickets">
              Tickets <span className="rounded bg-surface-2 px-1 text-[10px]">{c.tickets.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="timeline">
            <Timeline items={timeline} context={{ contactId: c.id, companyId: c.company?.id ?? null, dealId: openDeals[0]?.id ?? null }} currentUserId={user.id} canDeleteAny={user.tier !== "EMPLOYEE"} />
          </TabsContent>
          <TabsContent value="deals">
            {c.deals.length === 0 ? (
              <p className="text-sm text-muted">No deals yet. Convert this contact into a deal to start tracking the opportunity.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {c.deals.map(({ deal }) => (
                  <li key={deal.id} className="flex items-center gap-3 px-4 py-3">
                    <Kanban className="size-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/deals/${deal.id}`} className="font-medium hover:text-brand">
                        {deal.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {money(Number(deal.value))}
                        {Number(deal.monthlyValue) ? ` + ${money(Number(deal.monthlyValue))}/mo` : ""} · {deal.nextStep ? `Next: ${deal.nextStep}` : "No next step"}
                      </div>
                    </div>
                    <StatusBadge value={deal.stageKey} labelOverride={deal.stage.label} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="quotes">
            {c.quotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes for this contact.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {c.quotes.map((qt) => (
                  <li key={qt.id} className="flex items-center gap-3 px-4 py-3">
                    <FileText className="size-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/quotes/${qt.id}`} className="font-medium hover:text-brand">
                        {qt.number} · {qt.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {money(Number(qt.total))} · {qt.validUntil ? `valid until ${fmtDate(qt.validUntil)}` : ""}
                      </div>
                    </div>
                    <StatusBadge value={qt.status} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="tasks">
            <TaskListCompact tasks={c.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt?.toISOString() ?? null, priority: t.priority, status: t.status, assignee: t.assignee?.name ?? null, taskType: t.taskType }))} newHref={`/hq/tasks?new=1&contactId=${c.id}`} />
          </TabsContent>
          <TabsContent value="tickets">
            {c.tickets.length === 0 ? (
              <p className="text-sm text-muted">No support tickets.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {c.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/service/tickets/${t.id}`} className="font-medium hover:text-brand">
                        {t.number} · {t.subject}
                      </Link>
                      <div className="text-xs text-muted">Updated {relTime(t.updatedAt)}</div>
                    </div>
                    <StatusBadge value={t.priority} />
                    <StatusBadge value={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ContactSheetFromUrl
        initial={{
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          emailSecondary: c.emailSecondary,
          phoneMobile: c.phoneMobile,
          phoneOffice: c.phoneOffice,
          jobTitle: c.jobTitle,
          type: c.type,
          leadSource: c.leadSource,
          status: c.status as "active" | "inactive" | "archived",
          linkedinUrl: c.linkedinUrl,
          addressStreet: c.addressStreet,
          addressCity: c.addressCity,
          addressState: c.addressState,
          addressZip: c.addressZip,
          notes: c.notes,
          tags: c.tags,
          doNotContact: c.doNotContact,
          company: c.company ? { id: c.company.id, label: c.company.name } : null,
          owner: c.owner ? { id: c.owner.id, label: c.owner.name } : null,
        }}
      />
    </div>
  );
}
