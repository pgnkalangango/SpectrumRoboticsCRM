import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, LifeBuoy, Wrench, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate, label, relTime } from "@/lib/utils";
import { isWithinDays, OWNERSHIP_LABELS, PORTAL_STATUS_WORDS, ROBOT_STATUS_WORDS, renewalAlertDays } from "@/lib/service";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Fact, FactGrid, NoCompany, PortalHeader, PortalPanel, portalHref, previewFor } from "@/components/portal/ui";

export const metadata = { title: "Robot" };

export default async function PortalRobotPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const r = await prisma.robotUnit.findUnique({
    where: { id },
    select: {
      id: true, serialNumber: true, modelName: true, oem: true, status: true, ownership: true, installDate: true, warrantyEnd: true, raasTermEnd: true, lastMaintenance: true, nextMaintenance: true, maintenanceIntervalDays: true, firmwareVersion: true, companyId: true,
      site: { select: { id: true, name: true, addressCity: true, addressState: true } },
      maintenanceLogs: { orderBy: { performedAt: "desc" }, take: 20, select: { id: true, type: true, performedAt: true, notes: true } },
      tickets: { where: { clientVisible: true, status: { notIn: ["CLOSED"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, number: true, subject: true, status: true, priority: true, updatedAt: true } },
    },
  });
  if (!r || r.companyId !== scope.companyId) notFound();
  const alertDays = await renewalAlertDays();
  const now = new Date().getTime();
  const overdue = !!r.nextMaintenance && r.nextMaintenance.getTime() < now;
  const renew = isWithinDays(r.raasTermEnd, alertDays);
  const reportHref = portalHref(`/portal/support?new=1&robotId=${r.id}`, preview);

  return (
    <div>
      <PortalHeader
        back={{ href: portalHref("/portal/robots", preview), label: "All robots" }}
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-tint text-brand-deep dark:text-brand-bright">
              <Bot className="size-6" />
            </span>
            {r.modelName ?? r.oem ?? "Robot"}
          </span>
        }
        intro={
          <>
            Serial <span className="font-mono">{r.serialNumber}</span>
            {r.site ? ` at ${r.site.name}` : ""}
            {r.oem ? ` · made by ${r.oem}` : ""}.
          </>
        }
        action={
          <Button asChild size="lg">
            <Link href={reportHref}>
              <LifeBuoy /> Report a problem
            </Link>
          </Button>
        }
      />

      {overdue ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-4 text-warn">
          <CalendarClock className="mt-0.5 size-5 shrink-0" />
          <p className="text-[15px]">A service visit was due {fmtDate(r.nextMaintenance)}. Your Spectrum contact will reach out to schedule it. Nothing you need to do.</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <PortalPanel title="This unit">
            <FactGrid cols={3}>
              <Fact label="Status" value={<StatusBadge value={r.status} labelOverride={ROBOT_STATUS_WORDS[r.status]} />} />
              <Fact label="Plan" value={OWNERSHIP_LABELS[r.ownership]} />
              <Fact label="Location" value={r.site ? `${r.site.name}${r.site.addressCity ? `, ${[r.site.addressCity, r.site.addressState].filter(Boolean).join(", ")}` : ""}` : null} />
              <Fact label="Installed" value={r.installDate ? fmtDate(r.installDate) : "Not yet"} />
              <Fact label="Warranty until" value={r.warrantyEnd ? fmtDate(r.warrantyEnd) : null} tone={r.warrantyEnd && r.warrantyEnd.getTime() < now ? "warn" : "default"} />
              {r.ownership === "RAAS" ? <Fact label="Term ends" value={r.raasTermEnd ? fmtDate(r.raasTermEnd) : null} tone={renew ? "warn" : "default"} /> : <Fact label="Software" value={r.firmwareVersion} />}
              <Fact label="Last service" value={r.lastMaintenance ? fmtDate(r.lastMaintenance) : "None yet"} />
              <Fact label="Next service" value={r.nextMaintenance ? fmtDate(r.nextMaintenance) : "To be scheduled"} tone={overdue ? "warn" : "default"} />
              <Fact label="Service schedule" value={`Every ${r.maintenanceIntervalDays} days`} />
            </FactGrid>
            {renew ? <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-[14px] text-warn">Your service term ends {fmtDate(r.raasTermEnd)}. Your Spectrum contact will be in touch about renewing.</p> : null}
          </PortalPanel>

          <PortalPanel title="Service history" padded={false}>
            {r.maintenanceLogs.length === 0 ? (
              <p className="p-5 text-[15px] text-muted">No service visits yet. Each visit, repair and software update will be listed here.</p>
            ) : (
              <ol className="divide-y divide-line">
                {r.maintenanceLogs.map((m) => (
                  <li key={m.id} className="flex gap-3 px-5 py-4">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand">
                      <Wrench className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 text-[15px]">
                        <span className="font-semibold text-ink">{label(m.type)}</span>
                        <span className="text-muted">{fmtDate(m.performedAt)}</span>
                      </div>
                      {m.notes ? <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{m.notes}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </PortalPanel>
        </div>

        <div className="flex flex-col gap-5">
          <PortalPanel title="Open tickets for this robot" padded={false}>
            {r.tickets.length === 0 ? (
              <div className="p-5">
                <p className="text-[15px] text-muted">No open tickets. If something is wrong, tell us and we will get on it.</p>
                <Button asChild variant="secondary" className="mt-3 w-full" size="lg">
                  <Link href={reportHref}>Report a problem</Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {r.tickets.map((t) => (
                  <li key={t.id} className="px-5 py-3">
                    <Link href={portalHref(`/portal/support/${t.id}`, preview)} className="block text-[15px] font-medium text-ink hover:text-brand">
                      {t.subject}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                      <StatusBadge value={t.status} labelOverride={PORTAL_STATUS_WORDS[t.status]} />
                      {t.number} · updated {relTime(t.updatedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PortalPanel>
        </div>
      </div>
    </div>
  );
}
