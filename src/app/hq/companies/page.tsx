import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { label, money } from "@/lib/utils";
import { COMPANY_STATUSES, INDUSTRIES } from "@/lib/options";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import { CompanySheetFromUrl } from "@/components/hq/companies/company-form";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Companies" };
const PAGE_SIZE = 50;

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const where: Prisma.CompanyWhereInput = {
    ...(sp.status ? { status: sp.status as Prisma.CompanyWhereInput["status"] } : {}),
    ...(sp.industry ? { industry: sp.industry } : {}),
    ...(sp.owner === "me" ? { ownerId: user.id } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { domain: { contains: q, mode: "insensitive" } }, { addressCity: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { owner: { select: { name: true, image: true, avatarColor: true } }, _count: { select: { contacts: true, sites: true, robots: true } }, deals: { where: { stage: { isWon: false, isLost: false } }, select: { value: true, monthlyValue: true } } },
    }),
    prisma.company.count({ where }),
  ]);
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/companies?${next}`;
  };
  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={`${total} compan${total === 1 ? "y" : "ies"}. Customers, prospects, partners and vendors.`}
        actions={
          <Button asChild>
            <Link href="/hq/companies?new=1">
              <Plus /> New company
            </Link>
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder="Search company, domain, city"
        selects={[
          { name: "status", label: "All statuses", options: COMPANY_STATUSES },
          { name: "industry", label: "All industries", options: INDUSTRIES },
          { name: "owner", label: "Everyone's", options: [{ value: "me", label: "Mine" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Building2} title={q ? "No companies match" : "No companies yet"} body="Add a company to group its contacts, deals, sites and robots." action={<Button asChild><Link href="/hq/companies?new=1"><Plus /> New company</Link></Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Contacts</TableHead>
              <TableHead className="text-right">Open pipeline</TableHead>
              <TableHead className="text-right">Robots</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const open = c.deals.reduce((a, d) => a + Number(d.value), 0);
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/hq/companies/${c.id}`} className="flex items-center gap-2.5 font-medium hover:text-brand">
                      <Avatar name={c.name} src={c.logoUrl} size={28} />
                      <span>
                        <span className="block">{c.name}</span>
                        {c.domain ? <span className="block text-xs font-normal text-muted">{c.domain}</span> : null}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-ink-2">{c.industry ? label(c.industry) : <span className="text-faint">Not set</span>}</TableCell>
                  <TableCell className="text-ink-2">{[c.addressCity, c.addressState].filter(Boolean).join(", ") || <span className="text-faint">Not set</span>}</TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} />
                    {c.portalEnabled ? <StatusBadge value="CONNECTED" labelOverride="Portal" className="ml-1" /> : null}
                  </TableCell>
                  <TableCell className="text-right tabular">{c._count.contacts}</TableCell>
                  <TableCell className="text-right tabular">{open ? money(open) : <span className="text-faint">–</span>}</TableCell>
                  <TableCell className="text-right tabular">{c._count.robots || <span className="text-faint">–</span>}</TableCell>
                  <TableCell>{c.owner ? <span className="flex items-center gap-1.5"><Avatar name={c.owner.name} src={c.owner.image} color={c.owner.avatarColor} size={20} /> <span className="text-xs">{c.owner.name.split(" ")[0]}</span></span> : null}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
      <CompanySheetFromUrl />
    </div>
  );
}
