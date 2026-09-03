import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { fullName } from "@/lib/utils";

export type LookupItem = { id: string; label: string; sub?: string };

// Small typed lookups for pickers: contacts, companies, deals, users, products, sites, robots.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "contact";
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 12), 30);
  const companyId = url.searchParams.get("companyId") ?? undefined;
  const c = { contains: q, mode: "insensitive" as const };
  let items: LookupItem[] = [];
  switch (type) {
    case "contact": {
      const rows = await prisma.contact.findMany({ where: { AND: [companyId ? { companyId } : {}, q ? { OR: [{ firstName: c }, { lastName: c }, { email: c }, { companyName: c }] } : {}] }, take: limit, orderBy: { updatedAt: "desc" }, include: { company: { select: { name: true } } } });
      items = rows.map((r) => ({ id: r.id, label: fullName(r), sub: [r.jobTitle, r.company?.name ?? r.companyName].filter(Boolean).join(" · ") }));
      break;
    }
    case "company": {
      const rows = await prisma.company.findMany({ where: q ? { OR: [{ name: c }, { domain: c }] } : {}, take: limit, orderBy: { updatedAt: "desc" } });
      items = rows.map((r) => ({ id: r.id, label: r.name, sub: [r.industry, r.addressCity].filter(Boolean).join(" · ") }));
      break;
    }
    case "deal": {
      const rows = await prisma.deal.findMany({ where: { AND: [companyId ? { companyId } : {}, q ? { name: c } : {}] }, take: limit, orderBy: { updatedAt: "desc" }, include: { company: { select: { name: true } }, stage: true } });
      items = rows.map((r) => ({ id: r.id, label: r.name, sub: [r.company?.name, r.stage.label].filter(Boolean).join(" · ") }));
      break;
    }
    case "user": {
      const rows = await prisma.user.findMany({ where: { kind: "STAFF", status: { not: "INACTIVE" }, ...(q ? { OR: [{ name: c }, { email: c }] } : {}) }, take: limit, orderBy: { name: "asc" }, include: { department: { select: { name: true } } } });
      items = rows.map((r) => ({ id: r.id, label: r.name, sub: [r.title, r.department?.name].filter(Boolean).join(" · ") || r.email }));
      break;
    }
    case "product": {
      const rows = await prisma.product.findMany({ where: q ? { OR: [{ name: c }, { sku: c }, { oem: c }] } : {}, take: limit, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
      items = rows.map((r) => ({ id: r.id, label: r.name, sub: [r.oem, r.category, r.sku].filter(Boolean).join(" · ") }));
      break;
    }
    case "site": {
      const rows = await prisma.site.findMany({ where: { AND: [companyId ? { companyId } : {}, q ? { name: c } : {}] }, take: limit, include: { company: { select: { name: true } } } });
      items = rows.map((r) => ({ id: r.id, label: r.name, sub: [r.company.name, r.addressCity].filter(Boolean).join(" · ") }));
      break;
    }
    case "robot": {
      const rows = await prisma.robotUnit.findMany({ where: { AND: [companyId ? { companyId } : {}, q ? { OR: [{ serialNumber: c }, { modelName: c }] } : {}] }, take: limit, include: { site: { select: { name: true } } } });
      items = rows.map((r) => ({ id: r.id, label: `${r.modelName ?? r.oem ?? "Robot"} · ${r.serialNumber}`, sub: r.site?.name ?? "" }));
      break;
    }
    case "sop": {
      const rows = await prisma.sop.findMany({ where: { status: "PUBLISHED", ...(q ? { OR: [{ title: c }, { summary: c }] } : {}) }, take: limit, orderBy: { title: "asc" } });
      items = rows.map((r) => ({ id: r.id, label: r.title, sub: r.category }));
      break;
    }
  }
  return NextResponse.json({ items });
}
