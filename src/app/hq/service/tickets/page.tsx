import Link from "next/link";
import { LifeBuoy, Plus, BookOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { fmtDate, fullName, relTime, truncate } from "@/lib/utils";
import { OPEN_TICKET_STATUSES, TICKET_PRIORITIES, TICKET_STATUS_STEPS, robotLabel } from "@/lib/service";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import { SlaBadge } from "@/components/hq/service/sla-badge";
import { TicketSheetFromUrl, type TicketFormValues } from "@/components/hq/service/ticket-form";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Tickets" };
const PAGE_SIZE = 50;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const status = sp.status ?? "open";
  const where: Prisma.TicketWhereInput = {
    ...(status === "open" ? { status: { in: OPEN_TICKET_STATUSES } } : status === "done" ? { status: { in: ["RESOLVED", "CLOSED"] } } : status === "all" ? {} : { status: status as Prisma.TicketWhereInput["status"] }),
    ...(sp.priority ? { priority: sp.priority as Prisma.TicketWhereInput["priority"] } : {}),
    ...(sp.assignee === "me" ? { assigneeId: user.id } : sp.assignee === "unassigned" ? { assigneeId: null } : {}),
    ...(sp.company ? { companyId: sp.company } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }, { robotUnit: { serialNumber: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, companies, prefill] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: status === "done" ? [{ resolvedAt: "desc" }] : [{ slaDueAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { company: { select: { id: true, name: true } }, site: { select: { id: true, name: true } }, robotUnit: { select: { id: true, serialNumber: true, modelName: true, oem: true } }, assignee: { select: { name: true, image: true, avatarColor: true } } },
    }),
    prisma.ticket.count({ where }),
    prisma.company.findMany({ where: { tickets: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    loadPrefill(sp),
  ]);
  const now = new Date().getTime();
  const breached = rows.filter((t) => t.slaDueAt && !t.firstResponseAt && t.slaDueAt.getTime() < now && OPEN_TICKET_STATUSES.includes(t.status)).length;
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/service/tickets?${next}`;
  };
  const filtered = !!(q || sp.status || sp.priority || sp.assignee || sp.company);

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle={`${total} ${status === "open" ? "open " : status === "done" ? "closed " : ""}ticket${total === 1 ? "" : "s"}.${breached ? ` ${breached} past the SLA without a first response.` : " Respond within the SLA for each priority: critical 4 hours, high 24 hours, normal 3 days."}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/hq/sops/service-ticket-handling-and-sla">
                <BookOpen /> SLA SOP
              </Link>
            </Button>
            <Button asChild>
              <Link href="/hq/service/tickets?new=1">
                <Plus /> New ticket
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search number, subject, company, serial"
        selects={[
          { name: "status", label: "Open", options: [{ value: "all", label: "All statuses" }, { value: "done", label: "Resolved and closed" }, ...TICKET_STATUS_STEPS.map((s) => ({ value: s.value, label: s.label }))] },
          { name: "priority", label: "Any priority", options: TICKET_PRIORITIES },
          { name: "assignee", label: "Everyone's", options: [{ value: "me", label: "Mine" }, { value: "unassigned", label: "Unassigned" }] },
          { name: "company", label: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={LifeBuoy} title={filtered ? "No tickets match" : "No open tickets"} body={filtered ? "Try a different search or clear the filters." : "Nothing waiting on the team. New tickets from the client portal or the team show up here with their SLA clock."} action={<Button asChild><Link href="/hq/service/tickets?new=1"><Plus /> New ticket</Link></Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Company / site</TableHead>
              <TableHead>Robot</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link href={`/hq/service/tickets/${t.id}`} className="block font-medium hover:text-brand">
                    <span className="font-mono text-xs text-muted">{t.number}</span> {truncate(t.subject, 70)}
                  </Link>
                  {!t.clientVisible ? <Badge className="mt-0.5">Hidden from client</Badge> : null}
                </TableCell>
                <TableCell>
                  {t.company ? <Link href={`/hq/companies/${t.company.id}`} className="hover:text-brand">{t.company.name}</Link> : <span className="text-faint">No company</span>}
                  {t.site ? <Link href={`/hq/service/sites/${t.site.id}`} className="block text-xs text-muted hover:text-brand">{t.site.name}</Link> : null}
                </TableCell>
                <TableCell className="text-ink-2">{t.robotUnit ? <Link href={`/hq/service/robots/${t.robotUnit.id}`} className="hover:text-brand">{robotLabel(t.robotUnit)}</Link> : <span className="text-faint">None</span>}</TableCell>
                <TableCell><StatusBadge value={t.priority} /></TableCell>
                <TableCell><StatusBadge value={t.status} /></TableCell>
                <TableCell>{t.assignee ? <span className="flex items-center gap-1.5"><Avatar name={t.assignee.name} src={t.assignee.image} color={t.assignee.avatarColor} size={20} /> <span className="text-xs">{t.assignee.name.split(" ")[0]}</span></span> : <span className="text-xs text-warn">Unassigned</span>}</TableCell>
                <TableCell><SlaBadge slaDueAt={t.slaDueAt} status={t.status} firstResponseAt={t.firstResponseAt} resolvedAt={t.resolvedAt} /></TableCell>
                <TableCell className="text-xs text-muted" title={fmtDate(t.updatedAt)}>{relTime(t.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
      <TicketSheetFromUrl prefill={prefill} />
    </div>
  );
}

// Resolve labels for ids passed in the URL (from company, site, robot and contact pages) so the picker shows a real name.
async function loadPrefill(sp: Record<string, string | undefined>): Promise<Partial<TicketFormValues> | undefined> {
  if (!sp.new) return undefined;
  const out: Partial<TicketFormValues> = {};
  const [company, site, robot, contact] = await Promise.all([
    sp.companyId && !sp.companyName ? prisma.company.findUnique({ where: { id: sp.companyId }, select: { id: true, name: true } }) : null,
    sp.siteId && !sp.siteName ? prisma.site.findUnique({ where: { id: sp.siteId }, select: { id: true, name: true, companyId: true, company: { select: { name: true } } } }) : null,
    sp.robotId && !sp.robotName ? prisma.robotUnit.findUnique({ where: { id: sp.robotId }, select: { id: true, serialNumber: true, modelName: true, oem: true, companyId: true, company: { select: { name: true } } } }) : null,
    sp.contactId && !sp.contactName ? prisma.contact.findUnique({ where: { id: sp.contactId }, select: { id: true, firstName: true, lastName: true, companyId: true, company: { select: { name: true } } } }) : null,
  ]);
  if (company) out.company = { id: company.id, label: company.name };
  if (site) {
    out.site = { id: site.id, label: site.name };
    if (!out.company) out.company = { id: site.companyId, label: site.company.name };
  }
  if (robot) {
    out.robot = { id: robot.id, label: robotLabel(robot) };
    if (!out.company && robot.companyId && robot.company) out.company = { id: robot.companyId, label: robot.company.name };
  }
  if (contact) {
    out.contact = { id: contact.id, label: fullName(contact) };
    if (!out.company && contact.companyId && contact.company) out.company = { id: contact.companyId, label: contact.company.name };
  }
  return Object.keys(out).length ? out : undefined;
}
