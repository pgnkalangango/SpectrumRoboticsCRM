import Link from "next/link";
import { Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { cn, fmtDate, fullName, isOverdue, money } from "@/lib/utils";
import { markOverdueCore } from "@/lib/quotes/core";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import type { Prisma } from "@/generated/prisma/client";
import type { InvoiceStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Invoices" };
const PAGE_SIZE = 50;
const STATUSES: { value: InvoiceStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "VIEWED", label: "Viewed" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
];
const OPEN: InvoiceStatus[] = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const settings = await getSetting("invoices");
  await markOverdueCore(settings.overdueGraceDays ?? 0);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const status = STATUSES.find((s) => s.value === sp.status)?.value;
  const where: Prisma.InvoiceWhereInput = {
    ...(status ? { status } : sp.status === "open" ? { status: { in: OPEN } } : {}),
    ...(sp.owner === "me" ? { ownerId: user.id } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }, { quote: { number: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [rows, total, outstanding, overdue, paidMonth] = await Promise.all([
    prisma.invoice.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, owner: { select: { name: true, image: true, avatarColor: true } } } }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({ where: { status: { in: OPEN } }, _sum: { balanceDue: true }, _count: true }),
    prisma.invoice.aggregate({ where: { status: "OVERDUE" }, _sum: { balanceDue: true }, _count: true }),
    prisma.payment.aggregate({ where: { paidAt: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
  ]);
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/invoices?${next}`;
  };

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Invoices come from accepted quotes. Clients pay online by card or bank; checks and wires are recorded here." />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Outstanding" value={money(Number(outstanding._sum.balanceDue ?? 0))} sub={`${outstanding._count} open invoice${outstanding._count === 1 ? "" : "s"}`} />
        <Stat label="Overdue" value={money(Number(overdue._sum.balanceDue ?? 0))} sub={overdue._count ? `${overdue._count} past due, follow the collections SOP` : "Nothing past due"} tone={overdue._count ? "bad" : "default"} />
        <Stat label="Paid this month" value={money(Number(paidMonth._sum.amount ?? 0))} sub={`${paidMonth._count} payment${paidMonth._count === 1 ? "" : "s"} since ${fmtDate(monthStart)}`} tone="ok" />
      </div>
      <FilterBar
        searchPlaceholder="Search number, title, company, quote"
        selects={[
          { name: "status", label: "All statuses", options: [{ value: "open", label: "Open (unpaid)" }, ...STATUSES] },
          { name: "owner", label: "Everyone's", options: [{ value: "me", label: "Mine" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title={q || sp.status ? "No invoices match" : "No invoices yet"} body={q || sp.status ? "Try a different search or clear the filters." : "When a client accepts a quote, open it and click Create invoice."} action={<Link href="/hq/quotes?status=ACCEPTED" className="text-sm font-semibold text-brand hover:underline">See accepted quotes</Link>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const late = OPEN.includes(r.status) && isOverdue(r.dueDate);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/hq/invoices/${r.id}`} className="block hover:text-brand">
                      <span className="block font-medium tabular">{r.number}</span>
                      {r.title ? <span className="block max-w-64 truncate text-xs text-muted">{r.title}</span> : null}
                    </Link>
                  </TableCell>
                  <TableCell>{r.company ? <Link href={`/hq/companies/${r.company.id}`} className="hover:text-brand">{r.company.name}</Link> : <span className="text-faint">None</span>}</TableCell>
                  <TableCell>{r.contact ? <Link href={`/hq/contacts/${r.contact.id}`} className="hover:text-brand">{fullName(r.contact)}</Link> : <span className="text-faint">None</span>}</TableCell>
                  <TableCell className="text-ink-2">{fmtDate(r.issueDate)}</TableCell>
                  <TableCell className={cn("text-ink-2", late && "font-semibold text-bad")}>{r.dueDate ? fmtDate(r.dueDate) : <span className="text-faint">–</span>}</TableCell>
                  <TableCell className="text-right tabular">{money(Number(r.total), { cents: true })}</TableCell>
                  <TableCell className={cn("text-right font-medium tabular", Number(r.balanceDue) === 0 ? "text-muted" : "text-ink")}>{money(Number(r.balanceDue), { cents: true })}</TableCell>
                  <TableCell>
                    <StatusBadge value={r.status} />
                  </TableCell>
                  <TableCell>{r.owner ? <span className="flex items-center gap-1.5"><Avatar name={r.owner.name} src={r.owner.image} color={r.owner.avatarColor} size={20} /> <span className="text-xs">{r.owner.name.split(" ")[0]}</span></span> : null}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
    </div>
  );
}
