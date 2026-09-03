import { notFound } from "next/navigation";
import { Download, CheckCircle2, XCircle, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { logActivity } from "@/lib/audit";
import { fmtDate, money } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { NoCompany, PortalHeader, PortalPanel, portalHref, previewFor } from "@/components/portal/ui";
import { QuoteResponse } from "@/components/portal/quote-response";

export const metadata = { title: "Quote" };

export default async function PortalQuotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company?: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const sp = await searchParams;
  const preview = previewFor(user, sp.company);
  const scope = await portalScope(user, sp.company);
  if (!scope.companyId) return <NoCompany />;
  const q = await prisma.quote.findUnique({
    where: { id },
    select: {
      id: true, number: true, version: true, title: true, status: true, companyId: true, contactId: true, dealId: true, ownerId: true, validUntil: true, subtotal: true, discountTotal: true, deliveryFee: true, installFee: true, taxRate: true, taxAmount: true, monthlyTotal: true, oneTimeTotal: true, total: true, notes: true, terms: true, sentAt: true, viewedAt: true, respondedAt: true, acceptedByName: true, declineReason: true, createdAt: true,
      company: { select: { name: true } },
      owner: { select: { name: true, email: true, phone: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { id: true, description: true, quantity: true, unitPrice: true, pricingMode: true, discountPct: true, total: true } },
    },
  });
  if (!q || q.companyId !== scope.companyId || !["SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED"].includes(q.status)) notFound();

  // First open by the client marks the quote as viewed and tells the rep.
  if (q.status === "SENT" && user.kind === "CLIENT") {
    await prisma.quote.update({ where: { id: q.id }, data: { status: "VIEWED", viewedAt: q.viewedAt ?? new Date() } });
    await logActivity({ type: "QUOTE_VIEWED", subject: `${q.number} viewed in the portal`, quoteId: q.id, companyId: q.companyId, contactId: scope.contactId ?? q.contactId, dealId: q.dealId, actorLabel: user.name, source: "portal", direction: "INBOUND" });
    q.status = "VIEWED";
  }
  const open = q.status === "SENT" || q.status === "VIEWED";
  const expired = open && !!q.validUntil && q.validUntil.getTime() < new Date().getTime() - 86400000;
  const monthlyLines = q.lines.filter((l) => l.pricingMode === "MONTHLY");
  const oneTimeLines = q.lines.filter((l) => l.pricingMode !== "MONTHLY");

  return (
    <div>
      <PortalHeader
        back={{ href: portalHref("/portal/quotes", preview), label: "All quotes" }}
        title={q.title}
        intro={
          <>
            Quote {q.number}
            {q.version > 1 ? ` (version ${q.version})` : ""} for {q.company?.name}
            {q.sentAt ? `, sent ${fmtDate(q.sentAt)}` : ""}.{q.validUntil ? ` Pricing is valid until ${fmtDate(q.validUntil)}.` : ""}
          </>
        }
        action={
          <Button asChild variant="secondary" size="lg">
            <a href={portalHref(`/portal/quotes/${q.id}/pdf`, preview)} target="_blank" rel="noreferrer">
              <Download /> Download PDF
            </a>
          </Button>
        }
      />

      {q.status === "ACCEPTED" ? (
        <Notice tone="ok" icon={CheckCircle2} title="You accepted this quote" body={`Signed by ${q.acceptedByName ?? "you"} on ${fmtDate(q.respondedAt)}. Your Spectrum contact is preparing the invoice and scheduling next steps.`} />
      ) : q.status === "DECLINED" ? (
        <Notice tone="muted" icon={XCircle} title="You declined this quote" body={`On ${fmtDate(q.respondedAt)}.${q.declineReason ? ` Your note: "${q.declineReason}"` : ""} If anything changes, your Spectrum contact can send a revised quote.`} />
      ) : q.status === "EXPIRED" || expired ? (
        <Notice tone="warn" icon={Clock} title="This quote has expired" body="Pricing was valid until the date shown. Ask your Spectrum contact for a fresh quote and we will turn it around quickly." />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <PortalPanel title="What is included" padded={false}>
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
                  {oneTimeLines.length && monthlyLines.length ? <GroupRow label="One time" /> : null}
                  {oneTimeLines.map((l) => (
                    <LineRow key={l.id} line={l} />
                  ))}
                  {monthlyLines.length ? <GroupRow label="Monthly (Robot as a Service)" /> : null}
                  {monthlyLines.map((l) => (
                    <LineRow key={l.id} line={l} monthly />
                  ))}
                  {q.lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-muted">No line items on this quote.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-5 py-4">
              <dl className="ml-auto flex max-w-sm flex-col gap-1.5 text-[15px]">
                <Row label="Subtotal" value={money(Number(q.subtotal), { cents: true })} />
                {Number(q.discountTotal) ? <Row label="Discount" value={`- ${money(Number(q.discountTotal), { cents: true })}`} /> : null}
                {Number(q.deliveryFee) ? <Row label="Delivery" value={money(Number(q.deliveryFee), { cents: true })} /> : null}
                {Number(q.installFee) ? <Row label="Installation and training" value={money(Number(q.installFee), { cents: true })} /> : null}
                {Number(q.taxAmount) ? <Row label={`Tax (${Number(q.taxRate)}%)`} value={money(Number(q.taxAmount), { cents: true })} /> : null}
                <div className="my-1 h-px bg-line" />
                {Number(q.monthlyTotal) ? <Row label="Per month" value={money(Number(q.monthlyTotal), { cents: true })} strong /> : null}
                <Row label={Number(q.monthlyTotal) ? "Due up front" : "Total"} value={money(Number(q.oneTimeTotal) || Number(q.total), { cents: true })} strong />
              </dl>
            </div>
          </PortalPanel>

          {q.notes ? (
            <PortalPanel title="Notes from your Spectrum contact">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-2">{q.notes}</p>
            </PortalPanel>
          ) : null}
          {q.terms ? (
            <PortalPanel title="Terms">
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">{q.terms}</p>
            </PortalPanel>
          ) : null}
        </div>

        <div className="flex flex-col gap-5">
          {open && !expired ? <QuoteResponse quoteId={q.id} quoteNumber={q.number} defaultName={user.name} preview={preview} /> : null}
          <PortalPanel title="Status">
            <div className="flex flex-col gap-3 text-[15px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Status</span>
                <StatusBadge value={expired ? "EXPIRED" : q.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Sent</span>
                <span>{q.sentAt ? fmtDate(q.sentAt) : fmtDate(q.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Valid until</span>
                <span className={expired ? "text-warn" : ""}>{q.validUntil ? fmtDate(q.validUntil) : "Open"}</span>
              </div>
              {q.respondedAt ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted">Answered</span>
                  <span>{fmtDate(q.respondedAt)}</span>
                </div>
              ) : null}
            </div>
          </PortalPanel>
          {q.owner ? (
            <PortalPanel title="Questions?">
              <p className="text-[15px] text-ink-2">
                <span className="font-semibold text-ink">{q.owner.name}</span> prepared this quote and is happy to walk through it.
              </p>
              <div className="mt-2 flex flex-col gap-1 text-[14px]">
                <a href={`mailto:${q.owner.email}?subject=${encodeURIComponent(`Quote ${q.number}`)}`} className="text-brand hover:underline">{q.owner.email}</a>
                {q.owner.phone ? <a href={`tel:${q.owner.phone}`} className="text-brand hover:underline">{q.owner.phone}</a> : null}
              </div>
            </PortalPanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LineRow({ line, monthly }: { line: { description: string; quantity: number; unitPrice: unknown; discountPct: unknown; total: unknown }; monthly?: boolean }) {
  return (
    <tr>
      <td className="px-5 py-3 text-ink">
        {line.description}
        {Number(line.discountPct) ? <span className="ml-2 rounded bg-ok-soft px-1.5 text-xs font-semibold text-ok">{Number(line.discountPct)}% off</span> : null}
      </td>
      <td className="px-3 py-3 text-right tabular text-ink-2">{line.quantity}</td>
      <td className="px-3 py-3 text-right tabular text-ink-2">
        {money(Number(line.unitPrice), { cents: true })}
        {monthly ? <span className="text-xs text-muted">/mo</span> : null}
      </td>
      <td className="px-5 py-3 text-right tabular font-medium text-ink">
        {money(Number(line.total), { cents: true })}
        {monthly ? <span className="text-xs font-normal text-muted">/mo</span> : null}
      </td>
    </tr>
  );
}

function GroupRow({ label }: { label: string }) {
  return (
    <tr className="bg-surface-2/60">
      <td colSpan={4} className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</td>
    </tr>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-6 ${strong ? "font-display text-lg font-bold text-ink" : "text-ink-2"}`}>
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

function Notice({ tone, icon: Icon, title, body }: { tone: "ok" | "warn" | "muted"; icon: React.ElementType; title: string; body: string }) {
  const tones = { ok: "border-ok/40 bg-ok-soft text-ok", warn: "border-warn/40 bg-warn-soft text-warn", muted: "border-line bg-surface-2 text-ink-2" };
  return (
    <div className={`mb-5 flex gap-3 rounded-2xl border p-4 ${tones[tone]}`}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        <div className="font-display text-[16px] font-semibold">{title}</div>
        <p className="mt-0.5 text-[14px] leading-relaxed opacity-90">{body}</p>
      </div>
    </div>
  );
}
