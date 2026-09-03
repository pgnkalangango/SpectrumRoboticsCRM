import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate, money } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { Fact, FactGrid, NoCompany, PortalEmpty, PortalHeader, PortalPanel, portalHref, previewFor } from "@/components/portal/ui";

export const metadata = { title: "Invoices" };

const OPEN = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"];
const WORDS: Record<string, string> = { SENT: "Open", VIEWED: "Open", PARTIALLY_PAID: "Partly paid", PAID: "Paid", OVERDUE: "Past due", VOID: "Cancelled" };

export default async function PortalInvoicesPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const invoices = await prisma.invoice.findMany({ where: { companyId: scope.companyId, status: { not: "DRAFT" } }, orderBy: [{ issueDate: "desc" }], select: { id: true, number: true, title: true, status: true, total: true, balanceDue: true, issueDate: true, dueDate: true, paidAt: true, publicToken: true } });
  const open = invoices.filter((i) => OPEN.includes(i.status));
  const balance = open.reduce((a, i) => a + Number(i.balanceDue), 0);
  const overdue = open.filter((i) => i.status === "OVERDUE" || (i.dueDate && i.dueDate.getTime() < new Date().getTime() && Number(i.balanceDue) > 0)).length;

  return (
    <div>
      <PortalHeader title="Invoices" intro={invoices.length === 0 ? "Invoices from Spectrum Robotics will appear here." : balance > 0 ? `You have ${money(balance)} outstanding across ${open.length} invoice${open.length === 1 ? "" : "s"}.` : "You are all paid up. Thank you."} />
      {invoices.length ? (
        <PortalPanel className="mb-6">
          <FactGrid cols={3}>
            <Fact label="Balance due" value={money(balance)} tone={overdue ? "bad" : balance > 0 ? "warn" : "ok"} />
            <Fact label="Open invoices" value={String(open.length)} />
            <Fact label="Past due" value={String(overdue)} tone={overdue ? "bad" : "default"} />
          </FactGrid>
        </PortalPanel>
      ) : null}
      {invoices.length === 0 ? (
        <PortalEmpty icon={Receipt} title="No invoices yet" body="Once a quote is accepted, the invoice for it shows up here with a way to pay online." />
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.map((i) => {
            const isOpen = OPEN.includes(i.status);
            const late = isOpen && (i.status === "OVERDUE" || (i.dueDate && i.dueDate.getTime() < new Date().getTime()));
            return (
              <li key={i.id}>
                <Link href={portalHref(`/portal/invoices/${i.id}`, preview)} className={`group flex items-center gap-4 rounded-2xl border bg-surface p-5 shadow-sm transition-colors hover:border-brand ${late ? "border-bad/40" : isOpen ? "border-warn/40" : "border-line"}`}>
                  <div className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep sm:flex dark:text-brand-bright">
                    <Receipt className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[17px] font-semibold text-ink">{i.number}</span>
                      {i.title ? <span className="text-[15px] text-ink-2">{i.title}</span> : null}
                      <StatusBadge value={late ? "OVERDUE" : i.status} labelOverride={late ? "Past due" : WORDS[i.status]} />
                    </div>
                    <div className="mt-1 text-[14px] text-muted">
                      Issued {fmtDate(i.issueDate)}
                      {i.dueDate && isOpen ? ` · due ${fmtDate(i.dueDate)}` : ""}
                      {i.paidAt ? ` · paid ${fmtDate(i.paidAt)}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-lg font-bold tabular text-ink">{money(Number(i.total))}</div>
                    {isOpen && Number(i.balanceDue) !== Number(i.total) ? <div className="text-xs text-muted">{money(Number(i.balanceDue))} left</div> : null}
                  </div>
                  <ArrowRight className="size-5 shrink-0 text-faint transition-colors group-hover:text-brand" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
