import { ExternalLink, FileText, FolderOpen } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate, label } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NoCompany, PortalEmpty, PortalHeader } from "@/components/portal/ui";

export const metadata = { title: "Documents" };

export default async function PortalDocumentsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const docs = await prisma.document.findMany({ where: { companyId: scope.companyId, clientVisible: true }, orderBy: [{ createdAt: "desc" }], select: { id: true, name: true, url: true, category: true, createdAt: true, site: { select: { name: true } } } });
  const groups = new Map<string, typeof docs>();
  for (const d of docs) {
    const k = d.category;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }

  return (
    <div>
      <PortalHeader title="Documents" intro={docs.length ? "Contracts, manuals, certificates and other files Spectrum Robotics has shared with you." : "Files shared with you will appear here."} />
      {docs.length === 0 ? (
        <PortalEmpty icon={FolderOpen} title="No documents yet" body="Signed agreements, operator manuals and training certificates will be shared here as your deployment moves along." />
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([cat, items]) => (
            <section key={cat}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label(cat)}</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-sm">
                {items.map((d) => (
                  <li key={d.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep dark:text-brand-bright">
                      <FileText className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[16px] font-medium text-ink">{d.name}</div>
                      <div className="text-[13px] text-muted">
                        {fmtDate(d.createdAt)}
                        {d.site ? ` · ${d.site.name}` : ""}
                      </div>
                    </div>
                    <Button asChild variant="secondary">
                      <a href={d.url} target="_blank" rel="noreferrer">
                        Open <ExternalLink />
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
