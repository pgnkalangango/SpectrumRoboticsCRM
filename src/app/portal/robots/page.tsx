import Link from "next/link";
import { ArrowRight, Bot, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate } from "@/lib/utils";
import { isWithinDays, OWNERSHIP_LABELS, ROBOT_STATUS_WORDS, renewalAlertDays } from "@/lib/service";
import { StatusBadge } from "@/components/ui/badge";
import { NoCompany, PortalEmpty, PortalHeader, portalHref, previewFor } from "@/components/portal/ui";

export const metadata = { title: "My robots" };

export default async function PortalRobotsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const [robots, alertDays] = await Promise.all([
    prisma.robotUnit.findMany({ where: { companyId: scope.companyId, status: { notIn: ["RETIRED", "RETURNED"] } }, orderBy: [{ site: { name: "asc" } }, { serialNumber: "asc" }], select: { id: true, serialNumber: true, modelName: true, oem: true, status: true, ownership: true, installDate: true, warrantyEnd: true, nextMaintenance: true, raasTermEnd: true, site: { select: { id: true, name: true, addressCity: true, addressState: true } } } }),
    renewalAlertDays(),
  ]);
  const groups = new Map<string, { name: string; where: string; robots: typeof robots }>();
  for (const r of robots) {
    const key = r.site?.id ?? "none";
    if (!groups.has(key)) groups.set(key, { name: r.site?.name ?? "Not assigned to a location yet", where: r.site ? [r.site.addressCity, r.site.addressState].filter(Boolean).join(", ") : "", robots: [] });
    groups.get(key)!.robots.push(r);
  }
  const now = new Date().getTime();

  return (
    <div>
      <PortalHeader title="My robots" intro={robots.length ? `${robots.length} robot${robots.length === 1 ? "" : "s"} on your account, grouped by location. Open one to see its service history or report a problem.` : "Each robot on your account appears here with its service schedule."} />
      {robots.length === 0 ? (
        <PortalEmpty icon={Bot} title="No robots yet" body="Once your deployment is scheduled, each unit shows up here with its install date, warranty and next service visit." />
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.values()].map((g) => (
            <section key={g.name}>
              <h2 className="mb-2 flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                <MapPin className="size-4 text-brand" /> {g.name}
                {g.where ? <span className="font-normal text-muted">· {g.where}</span> : null}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {g.robots.map((r) => {
                  const overdue = !!r.nextMaintenance && r.nextMaintenance.getTime() < now;
                  const renew = isWithinDays(r.raasTermEnd, alertDays);
                  return (
                    <li key={r.id}>
                      <Link href={portalHref(`/portal/robots/${r.id}`, preview)} className="group flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-sm transition-colors hover:border-brand">
                        <div className="flex items-start gap-3">
                          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep dark:text-brand-bright">
                            <Bot className="size-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-display text-[17px] font-semibold text-ink">{r.modelName ?? r.oem ?? "Robot"}</div>
                            <div className="font-mono text-[13px] text-muted">{r.serialNumber}</div>
                          </div>
                          <ArrowRight className="size-5 shrink-0 text-faint transition-colors group-hover:text-brand" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge value={r.status} labelOverride={ROBOT_STATUS_WORDS[r.status]} />
                          <span className="text-[13px] text-muted">{OWNERSHIP_LABELS[r.ownership]}</span>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
                          <Item label="Installed" value={r.installDate ? fmtDate(r.installDate) : "Not yet"} />
                          <Item label="Warranty until" value={r.warrantyEnd ? fmtDate(r.warrantyEnd) : "n/a"} />
                          <Item label="Next service" value={r.nextMaintenance ? fmtDate(r.nextMaintenance) : "To be scheduled"} tone={overdue ? "warn" : undefined} />
                          {r.ownership === "RAAS" ? <Item label="Term ends" value={r.raasTermEnd ? fmtDate(r.raasTermEnd) : "n/a"} tone={renew ? "warn" : undefined} /> : null}
                        </dl>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Item({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={tone === "warn" ? "font-semibold text-warn" : "text-ink"}>{value}</dd>
    </div>
  );
}
