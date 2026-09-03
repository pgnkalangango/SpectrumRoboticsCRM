import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { fmtDate, fullName, money, relTime } from "@/lib/utils";
import { expireQuotesCore } from "@/lib/quotes/core";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import type { Prisma } from "@/generated/prisma/client";
import type { QuoteStatus } from "@/generated/prisma/enums";

export const metadata = { title: "Quotes" };
const PAGE_SIZE = 50;
const STATUSES: { value: QuoteStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "SENT", label: "Sent" },
  { value: "VIEWED", label: "Viewed" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
  { value: "SUPERSEDED", label: "Superseded" },
];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  await expireQuotesCore();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const status = STATUSES.find((s) => s.value === sp.status)?.value;
  const where: Prisma.QuoteWhereInput = {
    ...(status ? { status } : sp.status === "open" ? { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "VIEWED"] } } : {}),
    ...(sp.owner === "me" ? { ownerId: user.id } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }, { contact: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } }] } : {}),
  };
  const [rows, total, openAgg] = await Promise.all([
    prisma.quote.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { id: true, name: true } }, contact: { select: { id: true, firstName: true, lastName: true } }, owner: { select: { name: true, image: true, avatarColor: true } } } }),
    prisma.quote.count({ where }),
    prisma.quote.aggregate({ where: { status: { in: ["SENT", "VIEWED"] } }, _sum: { total: true, monthlyTotal: true }, _count: true }),
  ]);
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/quotes?${next}`;
  };

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle={`${openAgg._count} waiting on a client · ${money(Number(openAgg._sum.total ?? 0))}${Number(openAgg._sum.monthlyTotal ?? 0) ? ` + ${money(Number(openAgg._sum.monthlyTotal))}/mo` : ""} out for decision`}
        actions={
          <Button asChild>
            <Link href="/hq/quotes/new">
              <Plus /> New quote
            </Link>
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder="Search number, title, company, contact"
        selects={[
          { name: "status", label: "All statuses", options: [{ value: "open", label: "Open (not decided)" }, ...STATUSES] },
          { name: "owner", label: "Everyone's", options: [{ value: "me", label: "Mine" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={q || sp.status ? "No quotes match" : "No quotes yet"} body={q || sp.status ? "Try a different search or clear the filters." : "Build your first quote from the catalog. Clients accept online and the deal moves on its own."} action={<Button asChild><Link href="/hq/quotes/new"><Plus /> New quote</Link></Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quote</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">One time</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Viewed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/hq/quotes/${r.id}`} className="block hover:text-brand">
                    <span className="block font-medium">{r.title}</span>
                    <span className="block text-xs text-muted tabular">
                      {r.number}
                      {r.version > 1 ? ` · v${r.version}` : ""}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>{r.company ? <Link href={`/hq/companies/${r.company.id}`} className="hover:text-brand">{r.company.name}</Link> : <span className="text-faint">None</span>}</TableCell>
                <TableCell>{r.contact ? <Link href={`/hq/contacts/${r.contact.id}`} className="hover:text-brand">{fullName(r.contact)}</Link> : <span className="text-faint">None</span>}</TableCell>
                <TableCell className="text-right font-medium tabular">{money(Number(r.total))}</TableCell>
                <TableCell className="text-right tabular text-ink-2">{Number(r.monthlyTotal) ? `${money(Number(r.monthlyTotal))}/mo` : <span className="text-faint">–</span>}</TableCell>
                <TableCell>
                  <StatusBadge value={r.status} />
                </TableCell>
                <TableCell>{r.owner ? <span className="flex items-center gap-1.5"><Avatar name={r.owner.name} src={r.owner.image} color={r.owner.avatarColor} size={20} /> <span className="text-xs">{r.owner.name.split(" ")[0]}</span></span> : null}</TableCell>
                <TableCell className="text-xs text-muted">{r.sentAt ? relTime(r.sentAt) : <span className="text-faint">Not sent</span>}</TableCell>
                <TableCell className="text-xs text-muted">{r.viewedAt ? relTime(r.viewedAt) : r.validUntil && r.status === "DRAFT" ? `Valid to ${fmtDate(r.validUntil)}` : <span className="text-faint">–</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
    </div>
  );
}
