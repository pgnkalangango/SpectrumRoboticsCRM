import Link from "next/link";
import { ArrowRight, LifeBuoy, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { relTime } from "@/lib/utils";
import { PORTAL_STATUS_WORDS, robotLabel } from "@/lib/service";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { NoCompany, PortalEmpty, PortalHeader, portalHref, previewFor } from "@/components/portal/ui";
import { NewTicketForm } from "@/components/portal/new-ticket-form";

export const metadata = { title: "Support" };

export default async function PortalSupportPage({ searchParams }: { searchParams: Promise<{ company?: string; new?: string; robotId?: string; siteId?: string; view?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;

  if (sp.new) {
    const [sites, robots] = await Promise.all([
      prisma.site.findMany({ where: { companyId: scope.companyId, status: { notIn: ["CHURNED"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, addressCity: true } }),
      prisma.robotUnit.findMany({ where: { companyId: scope.companyId, status: { notIn: ["RETIRED", "RETURNED"] } }, orderBy: { serialNumber: "asc" }, select: { id: true, serialNumber: true, modelName: true, oem: true, siteId: true, site: { select: { name: true } } } }),
    ]);
    return (
      <div className="mx-auto max-w-2xl">
        <PortalHeader back={{ href: portalHref("/portal/support", preview), label: "All tickets" }} title="Tell us what is wrong" intro="We read every ticket. High priority issues get a response within 24 hours, normal ones within 3 business days." />
        <NewTicketForm
          sites={sites.map((s) => ({ id: s.id, label: s.name, sub: s.addressCity ?? undefined }))}
          robots={robots.map((r) => ({ id: r.id, label: robotLabel(r), sub: r.site?.name, siteId: r.siteId }))}
          defaultRobotId={sp.robotId}
          defaultSiteId={sp.siteId}
          preview={preview}
          onCancelHref={portalHref("/portal/support", preview)}
        />
      </div>
    );
  }

  const showClosed = sp.view === "closed";
  const tickets = await prisma.ticket.findMany({
    where: { companyId: scope.companyId, clientVisible: true, status: showClosed ? { in: ["RESOLVED", "CLOSED"] } : { notIn: ["RESOLVED", "CLOSED"] } },
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    select: { id: true, number: true, subject: true, status: true, priority: true, category: true, updatedAt: true, createdAt: true, robotUnit: { select: { serialNumber: true, modelName: true, oem: true } }, site: { select: { name: true } }, assignee: { select: { name: true } } },
  });

  return (
    <div>
      <PortalHeader
        title="Support"
        intro={showClosed ? "Tickets that are fixed or closed. Reply on one if the problem came back." : tickets.length ? `${tickets.length} open ticket${tickets.length === 1 ? "" : "s"}. We will keep each one updated here and by email.` : "Something not working? Open a ticket and the right person at Spectrum will pick it up."}
        action={
          <Button asChild size="lg">
            <Link href={portalHref("/portal/support?new=1", preview)}>
              <Plus /> New ticket
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-2 p-1 text-[14px] font-medium w-fit">
        <Link href={portalHref("/portal/support", preview)} className={`rounded-md px-3 py-1.5 ${!showClosed ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          Open
        </Link>
        <Link href={portalHref("/portal/support?view=closed", preview)} className={`rounded-md px-3 py-1.5 ${showClosed ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          Fixed and closed
        </Link>
      </div>
      {tickets.length === 0 ? (
        <PortalEmpty icon={LifeBuoy} title={showClosed ? "Nothing closed yet" : "No open tickets"} body={showClosed ? "Resolved tickets will be listed here for your records." : "Need help with a robot, charging, Wi-Fi or training? Open a ticket and we will respond within the promised time for its priority."} action={!showClosed ? <Button asChild size="lg"><Link href={portalHref("/portal/support?new=1", preview)}><Plus /> New ticket</Link></Button> : undefined} />
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={portalHref(`/portal/support/${t.id}`, preview)} className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-brand">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[17px] font-semibold text-ink">{t.subject}</span>
                    <StatusBadge value={t.status} labelOverride={PORTAL_STATUS_WORDS[t.status]} />
                    {t.priority === "HIGH" || t.priority === "CRITICAL" ? <StatusBadge value={t.priority} labelOverride="Urgent" /> : null}
                  </div>
                  <div className="mt-1 text-[14px] text-muted">
                    {t.number}
                    {t.robotUnit ? ` · ${robotLabel(t.robotUnit)}` : t.site ? ` · ${t.site.name}` : ""}
                    {t.assignee ? ` · ${t.assignee.name} is on it` : ""} · updated {relTime(t.updatedAt)}
                  </div>
                </div>
                <ArrowRight className="size-5 shrink-0 text-faint transition-colors group-hover:text-brand" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
