import Link from "next/link";
import { Download, Clock, CheckCircle2, XCircle, Phone, Mail } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { fmtDate, fullName } from "@/lib/utils";
import { loadQuoteDoc } from "@/lib/quotes/load";
import { markQuoteViewedCore } from "@/lib/quotes/core";
import { allowRequest } from "@/lib/quotes/ratelimit";
import { SpectrumWordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { QuoteDocument } from "@/components/hq/quotes/quote-document";
import { PublicQuoteActions } from "@/components/hq/quotes/public-quote-actions";

export const metadata = { title: "Your quote from Spectrum Robotics" };
export const dynamic = "force-dynamic";

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allowRequest(`q:${token}`)) return <Shell><Notice icon={Clock} title="Slow down a moment" body="Too many requests for this link. Please wait a minute and refresh." /></Shell>;
  let loaded = await loadQuoteDoc({ publicToken: token });
  if (!loaded || loaded.quote.status === "DRAFT" || loaded.quote.status === "PENDING_APPROVAL" || loaded.quote.status === "APPROVED") {
    return <Shell><Notice icon={XCircle} title="We could not find that quote" body="The link may be incomplete or the quote has been replaced. Contact your Spectrum Robotics rep for a fresh link." /></Shell>;
  }
  const q = loaded.quote;
  const now = new Date();
  if ((q.status === "SENT" || q.status === "VIEWED") && q.validUntil && q.validUntil < now) {
    await prisma.quote.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
    loaded = (await loadQuoteDoc({ id: q.id })) ?? loaded;
  } else if (q.status === "SENT") {
    await markQuoteViewedCore(q.id);
    loaded = (await loadQuoteDoc({ id: q.id })) ?? loaded;
  }
  const { quote, doc } = loaded;
  const open = quote.status === "SENT" || quote.status === "VIEWED";
  const rep = quote.owner;

  return (
    <Shell number={quote.number} token={token}>
      {quote.status === "ACCEPTED" ? <Banner tone="ok" icon={CheckCircle2} title={`Accepted${quote.acceptedByName ? ` by ${quote.acceptedByName}` : ""}${quote.respondedAt ? ` on ${fmtDate(quote.respondedAt, { year: "numeric" })}` : ""}`} body="Thank you. Your rep will follow up with the invoice and the next steps for delivery and installation." /> : null}
      {quote.status === "DECLINED" ? <Banner tone="muted" icon={XCircle} title="This quote was declined" body="If anything changes, your rep can send an updated version. Reach out any time." /> : null}
      {quote.status === "EXPIRED" ? <Banner tone="warn" icon={Clock} title="This quote has expired" body={`Pricing was valid until ${quote.validUntil ? fmtDate(quote.validUntil, { year: "numeric" }) : "the date shown"}. Ask your rep for a refreshed quote; it usually takes a day.`} /> : null}
      {quote.status === "SUPERSEDED" ? <Banner tone="muted" icon={Clock} title="A newer version of this quote exists" body="Check your email for the latest link, or ask your rep to resend it." /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <QuoteDocument doc={doc} />
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          {open ? <PublicQuoteActions token={token} number={quote.number} contactName={quote.contact ? fullName(quote.contact) : null} /> : null}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="eyebrow">Questions?</div>
            {rep ? (
              <div className="mt-2">
                <div className="text-sm font-semibold text-ink">{rep.name}</div>
                {rep.title ? <div className="text-xs text-muted">{rep.title}, Spectrum Robotics</div> : <div className="text-xs text-muted">Spectrum Robotics</div>}
                <div className="mt-2 flex flex-col gap-1 text-sm">
                  <a href={`mailto:${rep.email}`} className="flex items-center gap-1.5 text-brand hover:underline">
                    <Mail className="size-3.5" /> {rep.email}
                  </a>
                  {rep.phone ? (
                    <a href={`tel:${rep.phone}`} className="flex items-center gap-1.5 text-brand hover:underline">
                      <Phone className="size-3.5" /> {rep.phone}
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
            <a href={`/q/${token}/pdf`} target="_blank" rel="noreferrer">
              <Download /> Download PDF
            </a>
          </Button>
        </div>
      </div>
    </Shell>
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
            {number ? <span className="text-sm text-muted">Quote <span className="font-semibold text-ink tabular">{number}</span></span> : null}
            {token ? (
              <Button asChild variant="secondary" size="sm" className="no-print">
                <a href={`/q/${token}/pdf`} target="_blank" rel="noreferrer">
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
