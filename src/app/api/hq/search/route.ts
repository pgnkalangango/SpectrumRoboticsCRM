import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { fullName } from "@/lib/utils";

// Global search for the command palette. Returns a small set of matches across the main records.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || user.kind !== "STAFF") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const contains = { contains: q, mode: "insensitive" as const };
  const [contacts, companies, deals, quotes, tickets, sops, invoices] = await Promise.all([
    prisma.contact.findMany({ where: { OR: [{ firstName: contains }, { lastName: contains }, { email: contains }, { companyName: contains }] }, take: 5, select: { id: true, firstName: true, lastName: true, email: true, companyName: true, company: { select: { name: true } } } }),
    prisma.company.findMany({ where: { OR: [{ name: contains }, { domain: contains }] }, take: 5, select: { id: true, name: true, industry: true } }),
    prisma.deal.findMany({ where: { name: contains }, take: 5, select: { id: true, name: true, stageKey: true, company: { select: { name: true } } } }),
    prisma.quote.findMany({ where: { OR: [{ number: contains }, { title: contains }] }, take: 5, select: { id: true, number: true, title: true, status: true } }),
    prisma.ticket.findMany({ where: { OR: [{ number: contains }, { subject: contains }] }, take: 5, select: { id: true, number: true, subject: true, status: true } }),
    prisma.sop.findMany({ where: { status: "PUBLISHED", OR: [{ title: contains }, { summary: contains }, { keywords: { has: q.toLowerCase() } }] }, take: 5, select: { id: true, slug: true, title: true, category: true } }),
    prisma.invoice.findMany({ where: { OR: [{ number: contains }, { title: contains }] }, take: 3, select: { id: true, number: true, title: true, status: true } }),
  ]);
  const results = [
    ...contacts.map((c) => ({ type: "contact", id: c.id, title: fullName(c), subtitle: [c.email, c.company?.name ?? c.companyName].filter(Boolean).join(" · "), href: `/hq/contacts/${c.id}` })),
    ...companies.map((c) => ({ type: "company", id: c.id, title: c.name, subtitle: c.industry ?? "", href: `/hq/companies/${c.id}` })),
    ...deals.map((d) => ({ type: "deal", id: d.id, title: d.name, subtitle: [d.company?.name, d.stageKey].filter(Boolean).join(" · "), href: `/hq/deals/${d.id}` })),
    ...quotes.map((x) => ({ type: "quote", id: x.id, title: `${x.number} · ${x.title}`, subtitle: x.status, href: `/hq/quotes/${x.id}` })),
    ...invoices.map((x) => ({ type: "invoice", id: x.id, title: `${x.number}${x.title ? ` · ${x.title}` : ""}`, subtitle: x.status, href: `/hq/invoices/${x.id}` })),
    ...tickets.map((t) => ({ type: "ticket", id: t.id, title: `${t.number} · ${t.subject}`, subtitle: t.status, href: `/hq/service/tickets/${t.id}` })),
    ...sops.map((s) => ({ type: "sop", id: s.id, title: s.title, subtitle: s.category, href: `/hq/sops/${s.slug}` })),
  ];
  return NextResponse.json({ results });
}
