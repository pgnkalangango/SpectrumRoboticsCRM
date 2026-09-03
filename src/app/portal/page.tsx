import Link from "next/link";
import { ArrowRight, Bot, FileText, LifeBuoy, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { getSetting } from "@/lib/settings";
import { fmtDate, money, relTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { portalHref, previewFor } from "@/components/portal/ui";

export const metadata = { title: "Client portal" };

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const scope = await portalScope(user, sp.company);
  const preview = previewFor(user, sp.company);
  const portal = await getSetting("portal");
  const status = user.kind === "CLIENT" ? (await prisma.user.findUnique({ where: { id: user.id }, select: { status: true, emailVerified: true } })) : null;

  if (user.kind === "CLIENT" && status?.status !== "ACTIVE") {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <h1 className="font-display text-2xl font-bold">Your portal is almost ready</h1>
        <p className="mt-2 text-sm text-muted">
          {status?.emailVerified ? "The Spectrum Robotics team is confirming your account. You will get an email as soon as it is open." : "Confirm your email using the link we sent you. Then the team will open your portal."}
        </p>
        <p className="mt-6 text-sm text-muted">Questions? Call (630) 809-9698 or email info@spectrumrobotics.ai.</p>
      </div>
    );
  }
  if (!scope.companyId) {
    return <EmptyState title="No company linked yet" body="Your account is not linked to a company. Contact Spectrum Robotics and we will fix that." />;
  }

  const [company, quotes, invoices, robots, tickets] = await Promise.all([
    prisma.company.findUnique({ where: { id: scope.companyId }, select: { name: true } }),
    prisma.quote.findMany({ where: { companyId: scope.companyId, status: { in: ["SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"] } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.invoice.findMany({ where: { companyId: scope.companyId, status: { not: "DRAFT" } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.robotUnit.findMany({ where: { companyId: scope.companyId }, orderBy: { installDate: "desc" }, take: 6, include: { site: { select: { name: true } } } }),
    prisma.ticket.findMany({ where: { companyId: scope.companyId, clientVisible: true, status: { notIn: ["CLOSED"] } }, orderBy: { updatedAt: "desc" }, take: 5 }),
  ]);
  const openBalance = invoices.filter((i) => ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"].includes(i.status)).reduce((a, i) => a + Number(i.balanceDue), 0);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow mb-1">{company?.name}</div>
        <h1 className="font-display text-2xl font-bold">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted">{portal.welcomeMessage}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickCard href={portalHref("/portal/quotes", preview)} icon={FileText} title="Quotes" value={`${quotes.filter((q) => ["SENT", "VIEWED"].includes(q.status)).length} to review`} />
        <QuickCard href={portalHref("/portal/invoices", preview)} icon={Receipt} title="Balance due" value={money(openBalance)} tone={openBalance > 0 ? "warn" : "ok"} />
        <QuickCard href={portalHref("/portal/robots", preview)} icon={Bot} title="Robots" value={`${robots.length} on your account`} />
        <QuickCard href={portalHref("/portal/support", preview)} icon={LifeBuoy} title="Support" value={`${tickets.length} open ticket${tickets.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent quotes</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={portalHref("/portal/quotes", preview)}>
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">No quotes yet. When your Spectrum rep sends one, it shows up here for you to review and accept.</p>
            ) : (
              <ul className="divide-y divide-line">
                {quotes.map((q) => (
                  <li key={q.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={portalHref(`/portal/quotes/${q.id}`, preview)} className="block truncate text-sm font-medium hover:text-brand">
                        {q.title}
                      </Link>
                      <div className="text-xs text-muted">
                        {q.number} · {money(Number(q.total))}
                        {q.validUntil ? ` · valid until ${fmtDate(q.validUntil)}` : ""}
                      </div>
                    </div>
                    <StatusBadge value={q.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={portalHref("/portal/invoices", preview)}>
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={portalHref(`/portal/invoices/${i.id}`, preview)} className="block truncate text-sm font-medium hover:text-brand">
                        {i.number}
                        {i.title ? ` · ${i.title}` : ""}
                      </Link>
                      <div className="text-xs text-muted">
                        {money(Number(i.total))} · due {fmtDate(i.dueDate)}
                        {Number(i.balanceDue) > 0 && i.status !== "DRAFT" ? ` · ${money(Number(i.balanceDue))} outstanding` : ""}
                      </div>
                    </div>
                    <StatusBadge value={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your robots</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href={portalHref("/portal/robots", preview)}>
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {robots.length === 0 ? (
              <p className="text-sm text-muted">No robots on your account yet. Once a deployment is scheduled, each unit and its maintenance schedule appears here.</p>
            ) : (
              <ul className="divide-y divide-line">
                {robots.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {r.modelName ?? r.oem} · {r.serialNumber}
                      </div>
                      <div className="text-xs text-muted">
                        {r.site?.name ?? "Site not set"}
                        {r.nextMaintenance ? ` · next maintenance ${fmtDate(r.nextMaintenance)}` : ""}
                      </div>
                    </div>
                    <StatusBadge value={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open support tickets</CardTitle>
            <Button asChild size="sm">
              <Link href={portalHref("/portal/support?new=1", preview)}>New ticket</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-sm text-muted">No open tickets. Need help with a robot, charging, Wi-Fi or training? Open a ticket and we respond within the SLA for its priority.</p>
            ) : (
              <ul className="divide-y divide-line">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={portalHref(`/portal/support/${t.id}`, preview)} className="block truncate text-sm font-medium hover:text-brand">
                        {t.number} · {t.subject}
                      </Link>
                      <div className="text-xs text-muted">Updated {relTime(t.updatedAt)}</div>
                    </div>
                    <StatusBadge value={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickCard({ href, icon: Icon, title, value, tone = "default" }: { href: string; icon: React.ElementType; title: string; value: string; tone?: "default" | "warn" | "ok" }) {
  const tones = { default: "text-ink", warn: "text-warn", ok: "text-ok" };
  return (
    <Link href={href} className="group rounded-xl border border-line bg-surface p-4 shadow-sm transition-colors hover:border-brand">
      <div className="flex items-center gap-2 text-muted">
        <Icon className="size-4 text-brand" />
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
      </div>
      <div className={`mt-2 font-display text-lg font-bold ${tones[tone]}`}>{value}</div>
    </Link>
  );
}
