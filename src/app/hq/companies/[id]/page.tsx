import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Phone, MapPin, Pencil, Plus, Kanban, FileText, Receipt, Bot, LifeBuoy, Users, Sparkles, KeyRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getTimeline } from "@/lib/timeline";
import { fmtDate, fullName, label, money, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { Timeline } from "@/components/hq/timeline";
import { CompanySheetFromUrl } from "@/components/hq/companies/company-form";
import { ContactSheetFromUrl } from "@/components/hq/contacts/contact-sheet-url";

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const c = await prisma.company.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, image: true, avatarColor: true } },
      contacts: { where: { status: "active" }, orderBy: { updatedAt: "desc" }, take: 50 },
      deals: { include: { stage: true, owner: { select: { name: true } } }, orderBy: { updatedAt: "desc" } },
      quotes: { orderBy: { updatedAt: "desc" }, take: 20 },
      invoices: { orderBy: { updatedAt: "desc" }, take: 20 },
      sites: { include: { _count: { select: { robots: true } } } },
      robots: { include: { site: { select: { name: true } } }, orderBy: { installDate: "desc" } },
      tickets: { orderBy: { updatedAt: "desc" }, take: 20 },
      users: { select: { id: true, name: true, email: true, status: true, lastSeenAt: true } },
      documents: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!c) notFound();
  const timeline = await getTimeline({ companyId: id });
  const openDeals = c.deals.filter((d) => !d.stage.isWon && !d.stage.isLost);
  const openValue = openDeals.reduce((a, d) => a + Number(d.value), 0);
  const balanceDue = c.invoices.filter((i) => ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)).reduce((a, i) => a + Number(i.balanceDue), 0);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Companies", href: "/hq/companies" }, { label: c.name }]} />
      <RecordHeader
        avatar={<Avatar name={c.name} src={c.logoUrl} size={56} />}
        title={c.name}
        badges={
          <>
            <StatusBadge value={c.status} />
            {c.portalEnabled ? <Badge variant="brand">Portal enabled</Badge> : null}
          </>
        }
        subtitle={[c.industry ? label(c.industry) : null, [c.addressCity, c.addressState].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
        meta={
          <>
            {c.website ? <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand"><Globe className="size-3.5" /> {c.domain ?? c.website}</a> : null}
            {c.phone ? <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-brand"><Phone className="size-3.5" /> {c.phone}</a> : null}
            {c.addressStreet ? <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {c.addressStreet}</span> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/assistant?type=company&id=${c.id}&label=${encodeURIComponent(c.name)}`}>
                <Sparkles /> Ask assistant
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/deals?new=1&companyId=${c.id}`}>
                <Kanban /> Deal
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/quotes/new?companyId=${c.id}`}>
                <FileText /> Quote
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/clients?company=${c.id}`}>
                <KeyRound /> Portal access
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/hq/companies/${c.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Open pipeline" value={money(openValue)} sub={`${openDeals.length} open deal${openDeals.length === 1 ? "" : "s"}`} />
        <MiniStat label="Balance due" value={money(balanceDue)} sub={`${c.invoices.length} invoice${c.invoices.length === 1 ? "" : "s"}`} tone={balanceDue > 0 ? "warn" : "default"} />
        <MiniStat label="Robots" value={String(c.robots.length)} sub={`${c.sites.length} site${c.sites.length === 1 ? "" : "s"}`} />
        <MiniStat label="Open tickets" value={String(c.tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length)} sub={`${c.users.filter((u) => u.status === "ACTIVE").length} portal user${c.users.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Owner", value: c.owner ? <span className="flex items-center gap-1.5"><Avatar name={c.owner.name} src={c.owner.image} color={c.owner.avatarColor} size={18} /> {c.owner.name}</span> : null },
                { label: "Email domain", value: c.domain },
                { label: "Employees", value: c.employeeCount },
                { label: "Address", value: [c.addressStreet, c.addressCity, c.addressState, c.addressZip].filter(Boolean).join(", ") },
                { label: "Client code", value: c.clientCode },
                { label: "Source", value: c.source ? label(c.source) : null },
                { label: "Tags", value: c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null },
                { label: "Added", value: fmtDate(c.createdAt) },
              ]}
            />
          </Panel>
          <Panel
            title={`People (${c.contacts.length})`}
            action={
              <Link href={`/hq/companies/${c.id}?newContact=1`} className="text-xs text-brand hover:underline">
                Add
              </Link>
            }
          >
            {c.contacts.length === 0 ? (
              <p className="text-sm text-muted">No contacts yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.contacts.map((p) => (
                  <li key={p.id}>
                    <Link href={`/hq/contacts/${p.id}`} className="flex items-center gap-2.5 rounded-md p-1 hover:bg-surface-2">
                      <Avatar name={fullName(p)} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{fullName(p)}</span>
                        <span className="block truncate text-xs text-muted">{p.jobTitle ?? p.email ?? ""}</span>
                      </span>
                      {p.doNotContact ? <StatusBadge value="DENIED" labelOverride="DNC" className="ml-auto" /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {c.notes ? (
            <Panel title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{c.notes}</p>
            </Panel>
          ) : null}
        </div>

        <Tabs defaultValue={sp.tab ?? "timeline"}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="deals">Deals ({c.deals.length})</TabsTrigger>
            <TabsTrigger value="quotes">Quotes and invoices</TabsTrigger>
            <TabsTrigger value="service">Sites and robots</TabsTrigger>
            <TabsTrigger value="tickets">Tickets ({c.tickets.length})</TabsTrigger>
            <TabsTrigger value="portal">Portal ({c.users.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline">
            <Timeline items={timeline} context={{ companyId: c.id, dealId: openDeals[0]?.id ?? null }} currentUserId={user.id} canDeleteAny={user.tier !== "EMPLOYEE"} />
          </TabsContent>
          <TabsContent value="deals">
            {c.deals.length === 0 ? (
              <p className="text-sm text-muted">No deals yet.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {c.deals.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <Kanban className="size-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/deals/${d.id}`} className="font-medium hover:text-brand">
                        {d.name}
                      </Link>
                      <div className="text-xs text-muted">
                        {money(Number(d.value))}
                        {Number(d.monthlyValue) ? ` + ${money(Number(d.monthlyValue))}/mo` : ""} · {d.owner?.name ?? "Unassigned"} · {d.nextStep ? `Next: ${d.nextStep}` : "No next step"}
                      </div>
                    </div>
                    <StatusBadge value={d.stageKey} labelOverride={d.stage.label} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="quotes">
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Quotes" action={<Link href={`/hq/quotes/new?companyId=${c.id}`} className="text-xs text-brand hover:underline">New quote</Link>} padded={false}>
                {c.quotes.length === 0 ? <p className="p-4 text-sm text-muted">No quotes.</p> : (
                  <ul className="divide-y divide-line">
                    {c.quotes.map((q) => (
                      <li key={q.id} className="flex items-center gap-3 px-4 py-2.5">
                        <FileText className="size-4 text-muted" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/hq/quotes/${q.id}`} className="text-sm font-medium hover:text-brand">{q.number} · {q.title}</Link>
                          <div className="text-xs text-muted">{money(Number(q.total))} · {relTime(q.updatedAt)}</div>
                        </div>
                        <StatusBadge value={q.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Invoices" padded={false}>
                {c.invoices.length === 0 ? <p className="p-4 text-sm text-muted">No invoices.</p> : (
                  <ul className="divide-y divide-line">
                    {c.invoices.map((i) => (
                      <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Receipt className="size-4 text-muted" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/hq/invoices/${i.id}`} className="text-sm font-medium hover:text-brand">{i.number}{i.title ? ` · ${i.title}` : ""}</Link>
                          <div className="text-xs text-muted">{money(Number(i.total))} · due {fmtDate(i.dueDate)}{Number(i.balanceDue) > 0 ? ` · ${money(Number(i.balanceDue))} open` : ""}</div>
                        </div>
                        <StatusBadge value={i.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </TabsContent>
          <TabsContent value="service">
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Sites" action={<Link href={`/hq/service/sites?new=1&companyId=${c.id}`} className="text-xs text-brand hover:underline">Add site</Link>} padded={false}>
                {c.sites.length === 0 ? <p className="p-4 text-sm text-muted">No sites yet. Add the location where robots will be deployed.</p> : (
                  <ul className="divide-y divide-line">
                    {c.sites.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                        <MapPin className="size-4 text-muted" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/hq/service/sites/${s.id}`} className="text-sm font-medium hover:text-brand">{s.name}</Link>
                          <div className="text-xs text-muted">{[s.addressCity, s.addressState].filter(Boolean).join(", ")} · {s._count.robots} robot{s._count.robots === 1 ? "" : "s"}</div>
                        </div>
                        <StatusBadge value={s.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Robots" action={<Link href={`/hq/service/robots?new=1&companyId=${c.id}`} className="text-xs text-brand hover:underline">Add robot</Link>} padded={false}>
                {c.robots.length === 0 ? <p className="p-4 text-sm text-muted">No robots on this account.</p> : (
                  <ul className="divide-y divide-line">
                    {c.robots.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Bot className="size-4 text-muted" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/hq/service/robots/${r.id}`} className="text-sm font-medium hover:text-brand">{r.modelName ?? r.oem} · {r.serialNumber}</Link>
                          <div className="text-xs text-muted">{r.site?.name ?? "No site"}{r.nextMaintenance ? ` · maintenance ${fmtDate(r.nextMaintenance)}` : ""}</div>
                        </div>
                        <StatusBadge value={r.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </TabsContent>
          <TabsContent value="tickets">
            {c.tickets.length === 0 ? <p className="text-sm text-muted">No support tickets.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {c.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <LifeBuoy className="size-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/service/tickets/${t.id}`} className="font-medium hover:text-brand">{t.number} · {t.subject}</Link>
                      <div className="text-xs text-muted">Updated {relTime(t.updatedAt)}</div>
                    </div>
                    <StatusBadge value={t.priority} />
                    <StatusBadge value={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="portal">
            <Panel title="Portal users" action={<Link href={`/hq/clients?company=${c.id}&invite=1`} className="text-xs text-brand hover:underline">Invite someone</Link>} padded={false}>
              {c.users.length === 0 ? <p className="p-4 text-sm text-muted">Nobody at {c.name} has portal access yet. Invite the main contact so they can see quotes, invoices, robots and tickets.</p> : (
                <ul className="divide-y divide-line">
                  {c.users.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Users className="size-4 text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{u.name}</div>
                        <div className="text-xs text-muted">{u.email}{u.lastSeenAt ? ` · last seen ${relTime(u.lastSeenAt)}` : ""}</div>
                      </div>
                      <StatusBadge value={u.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </TabsContent>
        </Tabs>
      </div>

      <CompanySheetFromUrl
        initial={{ id: c.id, name: c.name, domain: c.domain, industry: c.industry, website: c.website, phone: c.phone, addressStreet: c.addressStreet, addressCity: c.addressCity, addressState: c.addressState, addressZip: c.addressZip, employeeCount: c.employeeCount, annualRevenue: c.annualRevenue ? Number(c.annualRevenue) : null, status: c.status, notes: c.notes, tags: c.tags, source: c.source, portalEnabled: c.portalEnabled, clientCode: c.clientCode, owner: c.owner ? { id: c.owner.id, label: c.owner.name } : null }}
      />
      <NewContactFromUrl companyId={c.id} companyName={c.name} />
      <span className="sr-only"><Plus /></span>
    </div>
  );
}

function MiniStat({ label: l, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="eyebrow">{l}</div>
      <div className={`mt-1 font-display text-xl font-bold tabular ${tone === "warn" ? "text-warn" : "text-ink"}`}>{value}</div>
      {sub ? <div className="text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

import { NewContactFromUrl } from "@/components/hq/companies/new-contact-from-url";
