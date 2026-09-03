import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Pencil, LifeBuoy, Wrench, BookOpen, Plus, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { fmtDate, fmtDateTime, label, relTime } from "@/lib/utils";
import { isWithinDays, OWNERSHIP_LABELS, renewalAlertDays, robotLabel, toDateInput } from "@/lib/service";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { RobotSheetFromUrl } from "@/components/hq/service/robot-form";
import { LogMaintenanceButton } from "@/components/hq/service/maintenance-dialog";
import { SlaBadge } from "@/components/hq/service/sla-badge";

export default async function RobotPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const r = await prisma.robotUnit.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true, oem: true, warrantyMonths: true } },
      company: { select: { id: true, name: true } },
      site: { select: { id: true, name: true, addressCity: true, addressState: true, technician: { select: { name: true } } } },
      maintenanceLogs: { orderBy: { performedAt: "desc" }, include: { performedBy: { select: { name: true, image: true, avatarColor: true } } } },
      tickets: { orderBy: [{ updatedAt: "desc" }], take: 50, include: { assignee: { select: { name: true } } } },
    },
  });
  if (!r) notFound();
  const alertDays = await renewalAlertDays();
  const now = new Date().getTime();
  const maintOverdue = !!r.nextMaintenance && r.nextMaintenance.getTime() < now && !["RETIRED", "RETURNED"].includes(r.status);
  const maintSoon = !maintOverdue && isWithinDays(r.nextMaintenance, 14);
  const renewSoon = isWithinDays(r.raasTermEnd, alertDays);
  const warrantyOver = !!r.warrantyEnd && r.warrantyEnd.getTime() < now;
  const openTickets = r.tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status));
  const title = r.modelName ?? r.oem ?? "Robot";
  const newTicketHref = `/hq/service/tickets?new=1&robotId=${r.id}&robotName=${encodeURIComponent(robotLabel(r))}${r.company ? `&companyId=${r.company.id}&companyName=${encodeURIComponent(r.company.name)}` : ""}${r.site ? `&siteId=${r.site.id}&siteName=${encodeURIComponent(r.site.name)}` : ""}`;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Robots", href: "/hq/service/robots" }, { label: r.serialNumber }]} />
      <RecordHeader
        avatar={
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep dark:text-brand-bright">
            <Bot className="size-6" />
          </div>
        }
        title={title}
        badges={
          <>
            <StatusBadge value={r.status} />
            <Badge>{OWNERSHIP_LABELS[r.ownership]}</Badge>
            {maintOverdue ? <Badge variant="bad">Maintenance overdue</Badge> : maintSoon ? <Badge variant="warn">Maintenance due soon</Badge> : null}
            {renewSoon ? <Badge variant="warn">RaaS renewal due</Badge> : null}
          </>
        }
        subtitle={
          <>
            <span className="font-mono">{r.serialNumber}</span>
            {r.oem ? ` · ${r.oem}` : ""}
            {r.assetTag ? ` · tag ${r.assetTag}` : ""}
          </>
        }
        meta={
          <>
            {r.company ? <Link href={`/hq/companies/${r.company.id}`} className="hover:text-brand">{r.company.name}</Link> : <span className="text-muted">Spectrum stock</span>}
            {r.site ? <Link href={`/hq/service/sites/${r.site.id}`} className="hover:text-brand">{r.site.name}{r.site.addressCity ? ` (${[r.site.addressCity, r.site.addressState].filter(Boolean).join(", ")})` : ""}</Link> : null}
            {r.installDate ? <span>Installed {fmtDate(r.installDate)}</span> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href="/hq/sops/service-preventive-maintenance">
                <BookOpen /> Maintenance SOP
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={newTicketHref}>
                <LifeBuoy /> Ticket
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/hq/service/robots/${r.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Unit">
            <KeyValue
              items={[
                { label: "Product", value: r.product ? <Link href={`/hq/catalog?q=${encodeURIComponent(r.product.name)}`} className="text-brand hover:underline">{r.product.name}</Link> : r.modelName },
                { label: "Manufacturer", value: r.oem },
                { label: "Serial", value: <span className="font-mono">{r.serialNumber}</span> },
                { label: "Asset tag", value: r.assetTag },
                { label: "Firmware", value: r.firmwareVersion },
                { label: "Company", value: r.company ? <Link href={`/hq/companies/${r.company.id}`} className="text-brand hover:underline">{r.company.name}</Link> : null },
                { label: "Site", value: r.site ? <Link href={`/hq/service/sites/${r.site.id}`} className="text-brand hover:underline">{r.site.name}</Link> : null },
                { label: "Site technician", value: r.site?.technician?.name ?? null },
              ]}
            />
          </Panel>
          <Panel title="Dates">
            <KeyValue
              items={[
                { label: "Installed", value: r.installDate ? fmtDate(r.installDate) : null },
                { label: "Warranty ends", value: r.warrantyEnd ? <span className={warrantyOver ? "text-bad" : ""}>{fmtDate(r.warrantyEnd)}{warrantyOver ? " (expired)" : ""}</span> : null },
                { label: "RaaS term ends", value: r.raasTermEnd ? <span className={renewSoon ? "font-semibold text-warn" : ""}>{fmtDate(r.raasTermEnd)}{renewSoon ? ` (${relTime(r.raasTermEnd)})` : ""}</span> : r.ownership === "RAAS" ? null : "Not a RaaS unit" },
                { label: "Last maintenance", value: r.lastMaintenance ? fmtDate(r.lastMaintenance) : null },
                { label: "Next maintenance", value: r.nextMaintenance ? <span className={maintOverdue ? "font-semibold text-bad" : maintSoon ? "font-semibold text-warn" : ""}>{fmtDate(r.nextMaintenance)} ({relTime(r.nextMaintenance)})</span> : null },
                { label: "Service interval", value: `Every ${r.maintenanceIntervalDays} days` },
              ]}
            />
          </Panel>
          {r.notes ? (
            <Panel title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{r.notes}</p>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <Wrench className="size-3.5" /> Maintenance history
              </span>
            }
            action={<LogMaintenanceButton robotId={r.id} intervalDays={r.maintenanceIntervalDays} />}
            padded={false}
          >
            {maintOverdue || maintSoon ? (
              <div className={`flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm ${maintOverdue ? "bg-bad-soft/50 text-bad" : "bg-warn-soft/50 text-warn"}`}>
                <CalendarClock className="size-4" />
                {maintOverdue ? `Service was due ${fmtDate(r.nextMaintenance)}. Log the visit once it is done.` : `Service is due ${fmtDate(r.nextMaintenance)}. Plan the visit with the site.`}
                <Link href="/hq/sops/service-preventive-maintenance" className="ml-auto text-xs font-medium underline">
                  Checklist
                </Link>
              </div>
            ) : null}
            {r.maintenanceLogs.length === 0 ? (
              <p className="p-4 text-sm text-muted">No maintenance logged yet. Every visit, repair or firmware update belongs here so the next technician knows the unit&apos;s history.</p>
            ) : (
              <ol className="divide-y divide-line">
                {r.maintenanceLogs.map((m) => {
                  const parts = (m.partsUsed as string[] | null) ?? [];
                  return (
                    <li key={m.id} className="flex gap-3 px-4 py-3">
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand">
                        <Wrench className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
                          <span className="font-semibold text-ink">{label(m.type)}</span>
                          <span className="text-muted" title={fmtDateTime(m.performedAt)}>{fmtDate(m.performedAt)}</span>
                          {m.performedBy ? (
                            <span className="ml-auto flex items-center gap-1 text-[11px] text-muted">
                              <Avatar name={m.performedBy.name} src={m.performedBy.image} color={m.performedBy.avatarColor} size={16} /> {m.performedBy.name}
                            </span>
                          ) : null}
                        </div>
                        {m.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{m.notes}</p> : null}
                        {parts.length ? <p className="mt-1 text-xs text-muted">Parts: {parts.join(", ")}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-1.5">
                <LifeBuoy className="size-3.5" /> Tickets ({openTickets.length} open)
              </span>
            }
            action={
              <Button asChild size="sm" variant="secondary">
                <Link href={newTicketHref}>
                  <Plus /> New ticket
                </Link>
              </Button>
            }
            padded={false}
          >
            {r.tickets.length === 0 ? (
              <div className="p-4">
                <EmptyState compact icon={LifeBuoy} title="No tickets for this unit" body="Tickets opened by the team or through the client portal for this robot will show up here." />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {r.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/service/tickets/${t.id}`} className="text-sm font-medium hover:text-brand">
                        {t.number} · {t.subject}
                      </Link>
                      <div className="text-xs text-muted">
                        {label(t.category)} · {t.assignee?.name ?? "Unassigned"} · updated {relTime(t.updatedAt)}
                      </div>
                    </div>
                    <SlaBadge slaDueAt={t.slaDueAt} status={t.status} firstResponseAt={t.firstResponseAt} resolvedAt={t.resolvedAt} />
                    <StatusBadge value={t.priority} />
                    <StatusBadge value={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <RobotSheetFromUrl
        defaultInterval={r.maintenanceIntervalDays}
        initial={{
          id: r.id,
          serialNumber: r.serialNumber,
          assetTag: r.assetTag,
          modelName: r.modelName,
          oem: r.oem,
          status: r.status,
          ownership: r.ownership,
          installDate: toDateInput(r.installDate),
          warrantyEnd: toDateInput(r.warrantyEnd),
          raasTermEnd: toDateInput(r.raasTermEnd),
          lastMaintenance: toDateInput(r.lastMaintenance),
          maintenanceIntervalDays: r.maintenanceIntervalDays,
          firmwareVersion: r.firmwareVersion,
          notes: r.notes,
          product: r.product ? { id: r.product.id, label: r.product.name, sub: r.product.oem ?? undefined } : null,
          company: r.company ? { id: r.company.id, label: r.company.name } : null,
          site: r.site ? { id: r.site.id, label: r.site.name } : null,
        }}
      />
    </div>
  );
}
