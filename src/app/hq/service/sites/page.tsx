import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { fmtDate, label } from "@/lib/utils";
import { SITE_TYPES } from "@/lib/options";
import { SITE_STATUSES } from "@/lib/service";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import { SiteSheetFromUrl } from "@/components/hq/service/site-form";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Sites" };
const PAGE_SIZE = 50;

export default async function SitesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const where: Prisma.SiteWhereInput = {
    ...(sp.status ? { status: sp.status as Prisma.SiteWhereInput["status"] } : {}),
    ...(sp.type ? { siteType: sp.type } : {}),
    ...(sp.company ? { companyId: sp.company } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { addressCity: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, companies, prefillCompany] = await Promise.all([
    prisma.site.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { id: true, name: true } }, accountManager: { select: { name: true, image: true, avatarColor: true } }, _count: { select: { robots: true, tickets: true } } } }),
    prisma.site.count({ where }),
    prisma.company.findMany({ where: { sites: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    sp.companyId ? prisma.company.findUnique({ where: { id: sp.companyId }, select: { id: true, name: true } }) : null,
  ]);
  const live = rows.filter((s) => s.status === "LIVE").length;
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/service/sites?${next}`;
  };

  return (
    <div>
      <PageHeader
        title="Sites"
        subtitle={`${total} site${total === 1 ? "" : "s"}${total ? `, ${live} live` : ""}. Every location where a robot runs or will run.`}
        actions={
          <Button asChild>
            <Link href="/hq/service/sites?new=1">
              <Plus /> New site
            </Link>
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder="Search site, city, company"
        selects={[
          { name: "status", label: "Any status", options: SITE_STATUSES },
          { name: "type", label: "All types", options: SITE_TYPES },
          { name: "company", label: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={MapPin} title={q || sp.status || sp.company ? "No sites match" : "No sites yet"} body={q || sp.status || sp.company ? "Try a different search or clear the filters." : "Add the first location where a robot will be deployed. Sites hold the robots, tickets, install checklist and training records for that place."} action={<Button asChild><Link href="/hq/service/sites?new=1"><Plus /> New site</Link></Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Robots</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Go live</TableHead>
              <TableHead>Account manager</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/hq/service/sites/${s.id}`} className="font-medium hover:text-brand">
                    {s.name}
                  </Link>
                  {s._count.tickets ? <span className="block text-xs text-muted">{s._count.tickets} ticket{s._count.tickets === 1 ? "" : "s"}</span> : null}
                </TableCell>
                <TableCell>
                  <Link href={`/hq/companies/${s.company.id}`} className="hover:text-brand">
                    {s.company.name}
                  </Link>
                </TableCell>
                <TableCell className="text-ink-2">{[s.addressCity, s.addressState].filter(Boolean).join(", ") || <span className="text-faint">Not set</span>}</TableCell>
                <TableCell>{label(s.siteType)}</TableCell>
                <TableCell className="text-right tabular">{s._count.robots}</TableCell>
                <TableCell>
                  <StatusBadge value={s.status} />
                </TableCell>
                <TableCell className="text-ink-2">{s.goLiveDate ? fmtDate(s.goLiveDate) : <span className="text-faint">Not set</span>}</TableCell>
                <TableCell>{s.accountManager ? <span className="flex items-center gap-1.5"><Avatar name={s.accountManager.name} src={s.accountManager.image} color={s.accountManager.avatarColor} size={20} /> <span className="text-xs">{s.accountManager.name.split(" ")[0]}</span></span> : <span className="text-faint">None</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
      <SiteSheetFromUrl defaultCompany={prefillCompany ? { id: prefillCompany.id, label: prefillCompany.name } : undefined} />
    </div>
  );
}
