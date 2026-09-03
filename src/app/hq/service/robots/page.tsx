import Link from "next/link";
import { Bot, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { cn, fmtDate } from "@/lib/utils";
import { isWithinDays, OWNERSHIPS, OWNERSHIP_LABELS, ROBOT_STATUSES, renewalAlertDays, defaultMaintenanceInterval } from "@/lib/service";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import { RobotSheetFromUrl } from "@/components/hq/service/robot-form";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Robots" };
const PAGE_SIZE = 50;

export default async function RobotsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const where: Prisma.RobotUnitWhereInput = {
    ...(sp.status ? { status: sp.status as Prisma.RobotUnitWhereInput["status"] } : {}),
    ...(sp.ownership ? { ownership: sp.ownership as Prisma.RobotUnitWhereInput["ownership"] } : {}),
    ...(sp.company ? { companyId: sp.company } : {}),
    ...(sp.due === "maintenance" ? { nextMaintenance: { lte: new Date() } } : {}),
    ...(q ? { OR: [{ serialNumber: { contains: q, mode: "insensitive" } }, { modelName: { contains: q, mode: "insensitive" } }, { oem: { contains: q, mode: "insensitive" } }, { assetTag: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }, { site: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, companies, alertDays, interval, prefillCompany] = await Promise.all([
    prisma.robotUnit.findMany({ where, orderBy: [{ nextMaintenance: { sort: "asc", nulls: "last" } }, { serialNumber: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { id: true, name: true } }, site: { select: { id: true, name: true } } } }),
    prisma.robotUnit.count({ where }),
    prisma.company.findMany({ where: { robots: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    renewalAlertDays(),
    defaultMaintenanceInterval(),
    sp.companyId ? prisma.company.findUnique({ where: { id: sp.companyId }, select: { id: true, name: true } }) : null,
  ]);
  const now = new Date().getTime();
  const overdue = rows.filter((r) => r.nextMaintenance && r.nextMaintenance.getTime() < now && !["RETIRED", "RETURNED"].includes(r.status)).length;
  const renewing = rows.filter((r) => isWithinDays(r.raasTermEnd, alertDays)).length;
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/service/robots?${next}`;
  };
  const filtered = !!(q || sp.status || sp.ownership || sp.company || sp.due);

  return (
    <div>
      <PageHeader
        title="Robots"
        subtitle={`${total} unit${total === 1 ? "" : "s"} in the fleet.${overdue ? ` ${overdue} overdue for maintenance.` : ""}${renewing ? ` ${renewing} RaaS term${renewing === 1 ? "" : "s"} ending within ${alertDays} days.` : ""}`}
        actions={
          <Button asChild>
            <Link href="/hq/service/robots?new=1">
              <Plus /> New robot
            </Link>
          </Button>
        }
      />
      <FilterBar
        searchPlaceholder="Search serial, model, tag, site"
        selects={[
          { name: "status", label: "Any status", options: ROBOT_STATUSES },
          { name: "ownership", label: "Any ownership", options: OWNERSHIPS },
          { name: "company", label: "All companies", options: companies.map((c) => ({ value: c.id, label: c.name })) },
          { name: "due", label: "All units", options: [{ value: "maintenance", label: "Maintenance due" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Bot} title={filtered ? "No robots match" : "No robots yet"} body={filtered ? "Try a different search or clear the filters." : "Add each unit by serial number. The fleet list drives maintenance reminders and renewal alerts."} action={<Button asChild><Link href="/hq/service/robots?new=1"><Plus /> New robot</Link></Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serial</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ownership</TableHead>
              <TableHead>Installed</TableHead>
              <TableHead>Next maintenance</TableHead>
              <TableHead>RaaS ends</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const maintOverdue = !!r.nextMaintenance && r.nextMaintenance.getTime() < now && !["RETIRED", "RETURNED"].includes(r.status);
              const maintSoon = !maintOverdue && isWithinDays(r.nextMaintenance, 14);
              const renewSoon = isWithinDays(r.raasTermEnd, alertDays);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/hq/service/robots/${r.id}`} className="font-mono text-[13px] font-medium hover:text-brand">
                      {r.serialNumber}
                    </Link>
                    {r.assetTag ? <span className="block text-xs text-muted">{r.assetTag}</span> : null}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{r.modelName ?? <span className="text-faint">Unknown model</span>}</span>
                    {r.oem ? <span className="block text-xs text-muted">{r.oem}</span> : null}
                  </TableCell>
                  <TableCell>{r.company ? <Link href={`/hq/companies/${r.company.id}`} className="hover:text-brand">{r.company.name}</Link> : <span className="text-faint">Spectrum stock</span>}</TableCell>
                  <TableCell>{r.site ? <Link href={`/hq/service/sites/${r.site.id}`} className="hover:text-brand">{r.site.name}</Link> : <span className="text-faint">No site</span>}</TableCell>
                  <TableCell><StatusBadge value={r.status} /></TableCell>
                  <TableCell className="text-ink-2">{OWNERSHIP_LABELS[r.ownership]}</TableCell>
                  <TableCell className="text-ink-2">{r.installDate ? fmtDate(r.installDate) : <span className="text-faint">Not yet</span>}</TableCell>
                  <TableCell>
                    {r.nextMaintenance ? (
                      maintOverdue ? <Badge variant="bad">Overdue · {fmtDate(r.nextMaintenance)}</Badge> : <span className={cn("text-ink-2", maintSoon && "font-semibold text-warn")}>{fmtDate(r.nextMaintenance)}</span>
                    ) : (
                      <span className="text-faint">Not scheduled</span>
                    )}
                  </TableCell>
                  <TableCell>{r.raasTermEnd ? renewSoon ? <Badge variant="warn">Renew · {fmtDate(r.raasTermEnd)}</Badge> : <span className="text-ink-2">{fmtDate(r.raasTermEnd)}</span> : <span className="text-faint">n/a</span>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
      <RobotSheetFromUrl defaultCompany={prefillCompany ? { id: prefillCompany.id, label: prefillCompany.name } : undefined} defaultInterval={interval} />
    </div>
  );
}
