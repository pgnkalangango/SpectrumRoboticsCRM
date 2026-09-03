import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { audit } from "@/lib/audit";

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(";") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Staff only export of the contact list as CSV. Logged to the audit trail.
export async function GET(req: Request) {
  const user = await requireStaff();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const rows = await prisma.contact.findMany({ where: status ? { status } : {}, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], include: { company: { select: { name: true } }, owner: { select: { name: true } } } });
  const headers = ["first_name", "last_name", "email", "phone", "office_phone", "company", "title", "type", "source", "status", "city", "state", "tags", "owner", "last_contacted", "created", "notes"];
  const lines = rows.map((c) => [c.firstName, c.lastName, c.email, c.phoneMobile, c.phoneOffice, c.company?.name ?? c.companyName, c.jobTitle, c.type, c.leadSource, c.status, c.addressCity, c.addressState, c.tags, c.owner?.name, c.lastContactedAt, c.createdAt, c.notes].map(cell).join(","));
  const csv = [headers.join(","), ...lines].join("\n") + "\n";
  await audit({ actorId: user.id, action: "export", entityType: "Contact", after: { rows: rows.length, status: status ?? "all" } });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="spectrum-contacts-${stamp}.csv"` } });
}
