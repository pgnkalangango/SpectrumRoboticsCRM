import { Award, GraduationCap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate } from "@/lib/utils";
import { isWithinDays } from "@/lib/service";
import { Badge } from "@/components/ui/badge";
import { NoCompany, PortalEmpty, PortalHeader, PortalPanel, previewFor } from "@/components/portal/ui";
import { RequestTrainingButton } from "@/components/portal/request-training-button";

export const metadata = { title: "Training" };

export default async function PortalTrainingPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const certs = await prisma.trainingCertificate.findMany({ where: { companyId: scope.companyId }, orderBy: [{ issuedAt: "desc" }], select: { id: true, certificateNumber: true, traineeName: true, robotModel: true, score: true, issuedAt: true, expiresAt: true, site: { select: { name: true } } } });
  const now = new Date().getTime();
  const active = certs.filter((c) => !c.expiresAt || c.expiresAt.getTime() >= now).length;

  return (
    <div>
      <PortalHeader title="Training" intro={certs.length ? `${active} of your team ${active === 1 ? "holds" : "hold"} a current operator certificate. Certificates are valid for one year.` : "Everyone who runs a robot should be certified. It takes about an hour on site."} action={<RequestTrainingButton preview={preview} />} />
      {certs.length === 0 ? (
        <PortalEmpty icon={GraduationCap} title="No certificates yet" body="After each training session your Spectrum technician issues a certificate for every operator. They will be listed here." />
      ) : (
        <PortalPanel padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-5 py-3">Operator</th>
                  <th className="px-3 py-3">Robot</th>
                  <th className="px-3 py-3">Issued</th>
                  <th className="px-3 py-3">Valid until</th>
                  <th className="px-5 py-3 text-right">Certificate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {certs.map((c) => {
                  const expired = !!c.expiresAt && c.expiresAt.getTime() < now;
                  const soon = !expired && isWithinDays(c.expiresAt, 60);
                  return (
                    <tr key={c.id}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Award className={`size-4 ${expired ? "text-faint" : "text-brand"}`} />
                          <span className="font-medium text-ink">{c.traineeName}</span>
                        </div>
                        {c.site ? <div className="pl-6 text-[13px] text-muted">{c.site.name}</div> : null}
                      </td>
                      <td className="px-3 py-3 text-ink-2">{c.robotModel ?? "All models"}</td>
                      <td className="px-3 py-3 text-ink-2">{fmtDate(c.issuedAt)}</td>
                      <td className="px-3 py-3">
                        {c.expiresAt ? (
                          <span className="flex items-center gap-2">
                            <span className={expired ? "text-muted" : "text-ink-2"}>{fmtDate(c.expiresAt)}</span>
                            {expired ? <Badge>Expired</Badge> : soon ? <Badge variant="warn">Renew soon</Badge> : <Badge variant="ok">Current</Badge>}
                          </span>
                        ) : (
                          <Badge variant="ok">Current</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] text-muted">{c.certificateNumber}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PortalPanel>
      )}
    </div>
  );
}
