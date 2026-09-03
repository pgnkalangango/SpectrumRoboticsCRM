import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate, money } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { NoCompany, PortalEmpty, PortalHeader, portalHref, previewFor } from "@/components/portal/ui";

export const metadata = { title: "Quotes" };

const WORDS: Record<string, string> = { SENT: "Waiting for your decision", VIEWED: "Waiting for your decision", ACCEPTED: "Accepted", DECLINED: "Declined", EXPIRED: "Expired" };

export default async function PortalQuotesPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const quotes = await prisma.quote.findMany({ where: { companyId: scope.companyId, status: { in: ["SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"] } }, orderBy: [{ updatedAt: "desc" }], select: { id: true, number: true, title: true, status: true, total: true, monthlyTotal: true, validUntil: true, sentAt: true, respondedAt: true } });
  const open = quotes.filter((q) => q.status === "SENT" || q.status === "VIEWED");
  const rest = quotes.filter((q) => q.status !== "SENT" && q.status !== "VIEWED");

  return (
    <div>
      <PortalHeader title="Quotes" intro={open.length ? `${open.length} quote${open.length === 1 ? " is" : "s are"} waiting for your decision. Open one to see the details, then accept or decline.` : "Every quote Spectrum Robotics has sent you, with its status."} />
      {quotes.length === 0 ? (
        <PortalEmpty icon={FileText} title="No quotes yet" body="When your Spectrum contact sends a quote, it shows up here for you to review and accept online." />
      ) : (
        <div className="flex flex-col gap-6">
          {open.length ? <QuoteList title="Needs your decision" quotes={open} preview={preview} highlight /> : null}
          {rest.length ? <QuoteList title={open.length ? "Earlier quotes" : "All quotes"} quotes={rest} preview={preview} /> : null}
        </div>
      )}
    </div>
  );
}

function QuoteList({ title, quotes, preview, highlight }: { title: string; quotes: { id: string; number: string; title: string; status: string; total: unknown; monthlyTotal: unknown; validUntil: Date | null; sentAt: Date | null; respondedAt: Date | null }[]; preview: string | null; highlight?: boolean }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="flex flex-col gap-3">
        {quotes.map((q) => (
          <li key={q.id}>
            <Link href={portalHref(`/portal/quotes/${q.id}`, preview)} className={`group flex items-center gap-4 rounded-2xl border bg-surface p-5 shadow-sm transition-colors hover:border-brand ${highlight ? "border-brand/40" : "border-line"}`}>
              <div className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep sm:flex dark:text-brand-bright">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[17px] font-semibold text-ink">{q.title}</span>
                  <StatusBadge value={q.status} labelOverride={WORDS[q.status]} />
                </div>
                <div className="mt-1 text-[14px] text-muted">
                  {q.number}
                  {q.sentAt ? ` · sent ${fmtDate(q.sentAt)}` : ""}
                  {q.validUntil && (q.status === "SENT" || q.status === "VIEWED") ? ` · valid until ${fmtDate(q.validUntil)}` : ""}
                  {q.respondedAt ? ` · answered ${fmtDate(q.respondedAt)}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg font-bold tabular text-ink">{money(Number(q.total))}</div>
                {Number(q.monthlyTotal) ? <div className="text-xs text-muted">{money(Number(q.monthlyTotal))} per month</div> : null}
              </div>
              <ArrowRight className="size-5 shrink-0 text-faint transition-colors group-hover:text-brand" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
