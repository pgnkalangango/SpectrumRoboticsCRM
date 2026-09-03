import Link from "next/link";
import { Plus, Upload, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { fmtDate, fullName, label, relTime } from "@/lib/utils";
import { CONTACT_TYPES, LEAD_SOURCES } from "@/lib/options";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { Pagination } from "@/components/hq/record";
import { ContactSheetFromUrl } from "@/components/hq/contacts/contact-sheet-url";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Contacts" };
const PAGE_SIZE = 50;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const q = sp.q?.trim();
  const where: Prisma.ContactWhereInput = {
    status: sp.status ?? "active",
    ...(sp.type ? { type: sp.type as Prisma.ContactWhereInput["type"] } : {}),
    ...(sp.source ? { leadSource: sp.source } : {}),
    ...(sp.owner === "me" ? { ownerId: user.id } : {}),
    ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { companyName: { contains: q, mode: "insensitive" } }, { company: { name: { contains: q, mode: "insensitive" } } }, { jobTitle: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { id: true, name: true } }, owner: { select: { name: true, image: true, avatarColor: true } }, _count: { select: { deals: true } } } }),
    prisma.contact.count({ where }),
  ]);
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).filter(([, v]) => v !== undefined) as [string, string][]);
    next.set("page", String(p));
    return `/hq/contacts?${next}`;
  };

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={`${total} ${sp.status === "archived" ? "archived" : "active"} contact${total === 1 ? "" : "s"}. Every person you sell to, support or partner with.`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/hq/contacts/import">
                <Upload /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/hq/contacts?new=1">
                <Plus /> New contact
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search name, email, company, title"
        selects={[
          { name: "type", label: "All types", options: CONTACT_TYPES },
          { name: "source", label: "Any source", options: LEAD_SOURCES },
          { name: "owner", label: "Everyone's", options: [{ value: "me", label: "Mine" }] },
          { name: "status", label: "Active", options: [{ value: "inactive", label: "Inactive" }, { value: "archived", label: "Archived" }] },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Users} title={q ? "No contacts match" : "No contacts yet"} body={q ? "Try a different spelling or clear the filters." : "Add your first contact or import a spreadsheet."} action={<Button asChild><Link href="/hq/contacts?new=1"><Plus /> New contact</Link></Button>} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last contacted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/hq/contacts/${c.id}`} className="flex items-center gap-2.5 font-medium hover:text-brand">
                    <Avatar name={fullName(c)} size={28} />
                    <span>
                      <span className="block">{fullName(c)}</span>
                      {c.jobTitle ? <span className="block text-xs font-normal text-muted">{c.jobTitle}</span> : null}
                    </span>
                  </Link>
                </TableCell>
                <TableCell>{c.company ? <Link href={`/hq/companies/${c.company.id}`} className="hover:text-brand">{c.company.name}</Link> : c.companyName ?? <span className="text-faint">None</span>}</TableCell>
                <TableCell>{c.email ? <a href={`mailto:${c.email}`} className="hover:text-brand">{c.email}</a> : <span className="text-faint">None</span>}</TableCell>
                <TableCell className="tabular">{c.phoneMobile ?? c.phoneOffice ?? <span className="text-faint">None</span>}</TableCell>
                <TableCell>
                  <StatusBadge value={c.type} />
                  {c.doNotContact ? <StatusBadge value="DENIED" labelOverride="Do not contact" className="ml-1" /> : null}
                </TableCell>
                <TableCell>{c.owner ? <span className="flex items-center gap-1.5"><Avatar name={c.owner.name} src={c.owner.image} color={c.owner.avatarColor} size={20} /> <span className="text-xs">{c.owner.name.split(" ")[0]}</span></span> : null}</TableCell>
                <TableCell className="text-xs text-muted">{c.lastContactedAt ? relTime(c.lastContactedAt) : `Added ${fmtDate(c.createdAt)}`}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={hrefFor} />
      <ContactSheetFromUrl />
      <span className="sr-only">{label("contacts")}</span>
    </div>
  );
}
