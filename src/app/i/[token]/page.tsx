import Link from "next/link";
import { Download, CheckCircle2, XCircle, Clock, Landmark, Mail, Phone } from "lucide-react";
import { fmtDate, money } from "@/lib/utils";
import { loadInvoiceDoc } from "@/lib/quotes/load";
import { markInvoiceViewedCore } from "@/lib/quotes/core";
import { allowRequest } from "@/lib/quotes/ratelimit";
import { stripeConfigured } from "@/lib/stripe";
import { SpectrumWordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "@/components/hq/quotes/quote-document";
import { PayButton } from "@/components/hq/invoices/public-invoice-actions";

export const metadata = { title: "Your invoice from Spectrum Robotics" };
export const dynamic = "force-dynamic";

export default async function PublicInvoicePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!allowRequest(`i:${token}`)) return <Shell><Notice icon={Clock} title="Slow down a moment" body="Too many requests for this link. Please wait a minute and refresh." /></Shell>;
  let loaded = await loadInvoiceDoc({ publicToken: token });
  if (!loaded || loaded.invoice.status === "DRAFT") return <Shell><Notice icon={XCircle} title="We could not find that invoice" body="The link may be incomplete. Contact your Spectrum Robotics rep for a fresh one." /></Shell>;
  if (loaded.invoice.status === "SENT") {
    await markInvoiceViewedCore(loaded.invoice.id);
    loaded = (await loadInvoiceDoc({ id: loaded.invoice.id })) ?? loaded;
  }
  const { invoice, doc } = loaded;
  const balance = doc.totals.balanceDue;
  const payable = balance > 0 && invoice.status !== "VOID";
  const online = stripeConfigured();

  return (
    <Shell number={invoice.number} token={token}>
      {sp.paid === "1" && invoice.status !== "PAID" ? <Banner tone="ok" icon={CheckCircle2} title="Thank you, your payment is on its way" body="Card payments post within a minute; bank transfers can take a few business days to clear. This page updates automatically once it lands." /> : null}
      {invoice.status === "PAID" ? <Banner tone="ok" icon={CheckCircle2} title={`Paid in full${invoice.paidAt ? ` on ${fmtDate(invoice.paidAt, { year: "numeric" })}` : ""}`} body="Thank you for your business. Keep this page for your records." /> : null}
      {invoice.status === "VOID" ? <Banner tone="muted" icon={XCircle} title="This invoice was cancelled" body="No payment is due on it. If you received a replacement invoice, use that link instead." /> : null}
      {invoice.status === "OVERDUE" ? <Banner tone="warn" icon={Clock} title="This invoice is past due" body={`It was due ${invoice.dueDate ? fmtDate(invoice.dueDate, { year: "numeric" }) : "earlier"}. Pay below or reach out if you need more time.`} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <InvoiceDocument doc={doc} />
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          {payable ? (
            <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
              <div className="eyebrow">Balance due</div>
              <div className="mt-1 font-display text-[28px] font-bold leading-none tabular text-ink">{money(balance, { cents: true })}</div>
              {invoice.dueDate ? <div className="mt-1 text-xs text-muted">Due {fmtDate(invoice.dueDate, { year: "numeric" })}</div> : null}
              <div className="mt-4">
                {online ? (
                  <>
                    <PayButton token={token} amountLabel={money(balance, { cents: true })} />
                    <p className="mt-2 text-center text-[11px] text-faint">Secure checkout by Stripe. Card or US bank account.</p>
                  </>
                ) : (
                  <WireInstructions number={invoice.number} company={doc.company} />
                )}
              </div>
              {online ? (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-medium text-ink-2 hover:text-ink">Prefer to pay by check or wire?</summary>
                  <div className="mt-2">
                    <WireInstructions number={invoice.number} company={doc.company} />
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="eyebrow">Questions about this invoice?</div>
            {invoice.owner ? (
              <div className="mt-2 text-sm">
                <div className="font-semibold text-ink">{invoice.owner.name}</div>
                <div className="mt-1.5 flex flex-col gap-1">
                  <a href={`mailto:${invoice.owner.email}`} className="flex items-center gap-1.5 text-brand hover:underline">
                    <Mail className="size-3.5" /> {invoice.owner.email}
                  </a>
                  {invoice.owner.phone ? (
                    <a href={`tel:${invoice.owner.phone}`} className="flex items-center gap-1.5 text-brand hover:underline">
                      <Phone className="size-3.5" /> {invoice.owner.phone}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              {doc.company.name}
              <br />
              {doc.company.address}
              <br />
              {doc.company.phone} · {doc.company.email}
            </div>
          </div>
          <Button asChild variant="secondary" className="w-full">
            <a href={`/i/${token}/pdf`} target="_blank" rel="noreferrer">
              <Download /> Download PDF
            </a>
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function WireInstructions({ number, company }: { number: string; company: { name: string; address: string; email: string; phone: string } }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3 text-sm text-ink-2">
      <div className="flex items-center gap-1.5 font-semibold text-ink">
        <Landmark className="size-4" /> Pay by check or wire
      </div>
      <p className="mt-1.5">
        Make checks payable to <span className="font-medium text-ink">{company.name}</span> and mail to:
      </p>
      <p className="mt-1 whitespace-pre-line font-medium text-ink">{`${company.name}\n${company.address}`}</p>
      <p className="mt-2">
        For wire or ACH details, email <a href={`mailto:${company.email}?subject=Wire%20details%20for%20${number}`} className="text-brand hover:underline">{company.email}</a> or call {company.phone}. Please reference <span className="font-medium text-ink tabular">{number}</span> with your payment.
      </p>
    </div>
  );
}

function Shell({ children, number, token }: { children: React.ReactNode; number?: string; token?: string }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="https://spectrumrobotics.ai" className="flex items-center">
            <SpectrumWordmark className="h-9" />
          </Link>
          <div className="flex items-center gap-3">
            {number ? <span className="text-sm text-muted">Invoice <span className="font-semibold text-ink tabular">{number}</span></span> : null}
            {token ? (
              <Button asChild variant="secondary" size="sm" className="no-print">
                <a href={`/i/${token}/pdf`} target="_blank" rel="noreferrer">
                  <Download /> PDF
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-center text-xs text-faint">Spectrum Robotics · 1795 Commerce Drive, Elk Grove Village, IL 60007 · (630) 809-9698</footer>
    </div>
  );
}

function Notice({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <Icon className="mx-auto mb-3 size-9 text-muted" />
      <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <p className="mt-4 text-sm text-muted">
        Call us at <a href="tel:+16308099698" className="font-medium text-brand">(630) 809-9698</a> or email <a href="mailto:info@spectrumrobotics.ai" className="font-medium text-brand">info@spectrumrobotics.ai</a>.
      </p>
    </div>
  );
}

function Banner({ tone, icon: Icon, title, body }: { tone: "ok" | "warn" | "muted"; icon: React.ElementType; title: string; body: string }) {
  const cls = tone === "ok" ? "border-ok/30 bg-ok-soft text-ok" : tone === "warn" ? "border-warn/30 bg-warn-soft text-warn" : "border-line bg-surface-2 text-ink-2";
  return (
    <div className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 ${cls}`}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm opacity-90">{body}</div>
      </div>
    </div>
  );
}
