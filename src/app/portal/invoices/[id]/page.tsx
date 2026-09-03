import { notFound } from "next/navigation";
import { CreditCard, CheckCircle2, Landmark } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { fmtDate, label, money } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Fact, FactGrid, NoCompany, PortalHeader, PortalPanel, portalHref, previewFor } from "@/components/portal/ui";

export const metadata = { title: "Invoice" };
const OPEN = ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"];

export default async function PortalInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true, number: true, title: true, status: true, companyId: true, issueDate: true, dueDate: true, subtotal: true, taxRate: true, taxAmount: true, total: true, amountPaid: true, balanceDue: true, paymentTerms: true, notes: true, publicToken: true, stripePaymentLinkUrl: true, paidAt: true, viewedAt: true,
      company: { select: { name: true } },
      owner: { select: { name: true, email: true } },
      quote: { select: { id: true, number: true, title: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, pricingMode: true, total: true } },
      payments: { orderBy: { paidAt: "desc" }, select: { id: true, amount: true, method: true, reference: true, paidAt: true } },
    },
  });
  if (!inv || inv.companyId !== scope.companyId || inv.status === "DRAFT") notFound();
  if (inv.status === "SENT" && user.kind === "CLIENT") {
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "VIEWED", viewedAt: inv.viewedAt ?? new Date() } });
    inv.status = "VIEWED";
  }
  const isOpen = OPEN.includes(inv.status);
  const late = isOpen && (inv.status === "OVERDUE" || (!!inv.dueDate && inv.dueDate.getTime() < new Date().getTime()));
  const balance = Number(inv.balanceDue);
  const payHref = inv.publicToken ? `/i/${inv.publicToken}` : inv.stripePaymentLinkUrl;

  return (
    <div>
      <PortalHeader
        back={{ href: portalHref("/portal/invoices", preview), label: "All invoices" }}
        title={
          <>
            Invoice {inv.number}
            {inv.title ? <span className="block text-lg font-medium text-muted">{inv.title}</span> : null}
          </>
        }
        intro={`Issued ${fmtDate(inv.issueDate)} to ${inv.company?.name}.${inv.dueDate ? ` Due ${fmtDate(inv.dueDate)}.` : ""}${inv.paymentTerms ? ` Terms: ${inv.paymentTerms}.` : ""}`}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <PortalPanel>
            <FactGrid cols={4}>
              <Fact label="Status" value={<StatusBadge value={late ? "OVERDUE" : inv.status} labelOverride={late ? "Past due" : inv.status === "PARTIALLY_PAID" ? "Partly paid" : inv.status === "SENT" || inv.status === "VIEWED" ? "Open" : undefined} />} />
              <Fact label="Total" value={money(Number(inv.total), { cents: true })} />
              <Fact label="Paid" value={money(Number(inv.amountPaid), { cents: true })} tone={Number(inv.amountPaid) > 0 ? "ok" : "default"} />
              <Fact label="Balance due" value={money(balance, { cents: true })} tone={late ? "bad" : balance > 0 ? "warn" : "ok"} />
            </FactGrid>
          </PortalPanel>

          <PortalPanel title="Details" padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-5 py-3">Item</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-5 py-3 text-ink">{l.description}</td>
                      <td className="px-3 py-3 text-right tabular text-ink-2">{l.quantity}</td>
                      <td className="px-3 py-3 text-right tabular text-ink-2">
                        {money(Number(l.unitPrice), { cents: true })}
                        {l.pricingMode === "MONTHLY" ? <span className="text-xs text-muted">/mo</span> : null}
                      </td>
                      <td className="px-5 py-3 text-right tabular font-medium text-ink">{money(Number(l.total), { cents: true })}</td>
                    </tr>
                  ))}
                  {inv.lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-muted">No line items.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-5 py-4">
              <dl className="ml-auto flex max-w-sm flex-col gap-1.5 text-[15px] text-ink-2">
                <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular">{money(Number(inv.subtotal), { cents: true })}</dd></div>
                {Number(inv.taxAmount) ? <div className="flex justify-between"><dt>Tax ({Number(inv.taxRate)}%)</dt><dd className="tabular">{money(Number(inv.taxAmount), { cents: true })}</dd></div> : null}
                <div className="my-1 h-px bg-line" />
                <div className="flex justify-between font-display text-lg font-bold text-ink"><dt>Total</dt><dd className="tabular">{money(Number(inv.total), { cents: true })}</dd></div>
                {Number(inv.amountPaid) ? <div className="flex justify-between text-ok"><dt>Paid</dt><dd className="tabular">- {money(Number(inv.amountPaid), { cents: true })}</dd></div> : null}
                {Number(inv.amountPaid) ? <div className="flex justify-between font-semibold text-ink"><dt>Balance due</dt><dd className="tabular">{money(balance, { cents: true })}</dd></div> : null}
              </dl>
            </div>
          </PortalPanel>

          {inv.payments.length ? (
            <PortalPanel title="Payments received" padded={false}>
              <ul className="divide-y divide-line">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-[15px]">
                    <CheckCircle2 className="size-5 text-ok" />
                    <div className="flex-1">
                      <span className="font-medium text-ink">{money(Number(p.amount), { cents: true })}</span>
                      <span className="text-muted"> by {label(p.method)}{p.reference ? ` · ref ${p.reference}` : ""}</span>
                    </div>
                    <span className="text-muted">{fmtDate(p.paidAt)}</span>
                  </li>
                ))}
              </ul>
            </PortalPanel>
          ) : null}
          {inv.notes ? (
            <PortalPanel title="Notes">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{inv.notes}</p>
            </PortalPanel>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          {isOpen && balance > 0 ? (
            payHref ? (
              <div className="rounded-2xl border border-brand/30 bg-brand-mist p-5">
                <h2 className="font-display text-lg font-semibold text-ink">Pay {money(balance, { cents: true })}</h2>
                <p className="mt-1 text-[15px] text-ink-2">Card or bank transfer, on a secure page. You will get a receipt by email.</p>
                <Button asChild size="lg" className="mt-4 w-full">
                  <a href={payHref} target="_blank" rel="noreferrer">
                    <CreditCard /> Pay online
                  </a>
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                  <Landmark className="size-5 text-brand" /> How to pay
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Send a check or wire for {money(balance, { cents: true })} to:</p>
                <address className="mt-2 not-italic text-[15px] leading-relaxed text-ink">
                  Spectrum Robotics
                  <br />
                  1795 Commerce Drive
                  <br />
                  Elk Grove Village, IL 60007
                </address>
                <p className="mt-3 text-[14px] text-muted">Please write {inv.number} on the memo line. For wire details or questions, email <a href="mailto:info@spectrumrobotics.ai" className="text-brand hover:underline">info@spectrumrobotics.ai</a>.</p>
              </div>
            )
          ) : inv.status === "PAID" ? (
            <div className="rounded-2xl border border-ok/40 bg-ok-soft p-5 text-ok">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <CheckCircle2 className="size-5" /> Paid in full
              </h2>
              <p className="mt-1 text-[15px] opacity-90">{inv.paidAt ? `Received ${fmtDate(inv.paidAt)}. ` : ""}Thank you.</p>
            </div>
          ) : null}
          {inv.quote ? (
            <PortalPanel title="From quote">
              <a href={portalHref(`/portal/quotes/${inv.quote.id}`, preview)} className="text-[15px] font-medium text-brand hover:underline">
                {inv.quote.number} · {inv.quote.title}
              </a>
            </PortalPanel>
          ) : null}
          <PortalPanel title="Questions about this invoice?">
            <p className="text-[15px] text-ink-2">{inv.owner ? <><span className="font-semibold text-ink">{inv.owner.name}</span> can help. Email <a href={`mailto:${inv.owner.email}?subject=${encodeURIComponent(`Invoice ${inv.number}`)}`} className="text-brand hover:underline">{inv.owner.email}</a>.</> : <>Email <a href="mailto:info@spectrumrobotics.ai" className="text-brand hover:underline">info@spectrumrobotics.ai</a> or call (630) 809-9698.</>}</p>
          </PortalPanel>
        </div>
      </div>
    </div>
  );
}
