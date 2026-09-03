import * as React from "react";
import { SpectrumWordmark } from "@/components/brand/logo";
import { cn, fmtDate, money } from "@/lib/utils";
import type { DocLine, DocParty, InvoiceDoc, QuoteDoc } from "@/lib/quotes/document";

// The quote laid out like a printed document. Server renderable; used on the staff detail page,
// the public page and print. Never pass internal notes into it.

const date = (iso: string | null | undefined) => (iso ? fmtDate(iso, { year: "numeric" }) : "");

export function DocShell({ kind, number, version, children, footer }: { kind: "quote" | "invoice"; number: string; version?: number; children: React.ReactNode; footer: string }) {
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white text-[#141517] shadow-sm print:rounded-none print:border-0 print:shadow-none">
      <header className="flex items-start justify-between gap-6 bg-[#149CA0] px-8 py-6 text-white sm:px-10">
        <div className="pt-1">
          <SpectrumWordmark className="h-11" color="#ffffff" subColor="rgba(255,255,255,0.82)" bg="#149CA0" />
        </div>
        <div className="text-right">
          <div className="font-display text-[22px] font-bold uppercase tracking-wide leading-none">{kind}</div>
          <div className="mt-1.5 font-display text-sm font-semibold tabular">{number}</div>
          {version && version > 1 ? <div className="mt-0.5 text-[11px] text-white/80">Version {version}</div> : null}
        </div>
      </header>
      <div className="px-8 py-7 sm:px-10">{children}</div>
      <footer className="border-t border-[#e6eeef] px-8 py-3 text-center text-[11px] text-[#6e7780] sm:px-10">{footer}</footer>
    </article>
  );
}

export function DocMeta({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6e7780]">{it.label}</dt>
          <dd className="mt-1 text-[13.5px] font-semibold">{it.value ?? <span className="text-[#9aa4ab]">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DocParties({ billTo, from, preparedBy }: { billTo: DocParty; from: { name: string; address: string; phone: string; email: string }; preparedBy: { name: string; email: string; title: string | null; phone: string | null } | null }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6e7780]">Bill to</div>
        <div className="mt-1.5 text-[14px] font-bold">{billTo.name}</div>
        <div className="mt-0.5 text-[13px] leading-relaxed text-[#3f4650]">
          {billTo.contactName ? <div>{billTo.contactName}</div> : null}
          {billTo.addressLines.map((l) => (
            <div key={l}>{l}</div>
          ))}
          {billTo.email ? <div>{billTo.email}</div> : null}
          {billTo.phone ? <div>{billTo.phone}</div> : null}
        </div>
      </div>
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6e7780]">From</div>
        <div className="mt-1.5 text-[14px] font-bold">{from.name}</div>
        <div className="mt-0.5 text-[13px] leading-relaxed text-[#3f4650]">
          <div>{from.address}</div>
          <div>
            {from.phone} · {from.email}
          </div>
          {preparedBy ? (
            <div className="mt-1.5">
              <span className="font-semibold text-[#141517]">{preparedBy.name}</span>
              {preparedBy.title ? `, ${preparedBy.title}` : ""}
              <div>{preparedBy.email}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DocTable({ title, lines, showDiscount, monthly }: { title?: string; lines: DocLine[]; showDiscount: boolean; monthly?: boolean }) {
  if (lines.length === 0) return null;
  return (
    <div>
      {title ? <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#0f7c80]">{title}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-[#e3f3f4] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6e7780]">
              <th className="rounded-l-md px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">{monthly ? "Per month" : "Unit price"}</th>
              {showDiscount ? <th className="px-3 py-2 text-right">Disc.</th> : null}
              <th className="rounded-r-md px-3 py-2 text-right">{monthly ? "Monthly" : "Amount"}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-[#e6eeef] last:border-0">
                <td className="px-3 py-2.5 align-top text-[#141517]">{l.description}</td>
                <td className="px-3 py-2.5 text-right align-top tabular text-[#3f4650]">{l.quantity}</td>
                <td className="px-3 py-2.5 text-right align-top tabular text-[#3f4650]">{money(l.unitPrice, { cents: true })}</td>
                {showDiscount ? <td className="px-3 py-2.5 text-right align-top tabular text-[#3f4650]">{l.discountPct ? `${l.discountPct}%` : ""}</td> : null}
                <td className="px-3 py-2.5 text-right align-top font-semibold tabular">{money(l.total, { cents: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DocTotals({ rows }: { rows: { label: string; value: string; strong?: boolean; muted?: boolean }[] }) {
  return (
    <div className="ml-auto w-full max-w-xs">
      {rows.map((r) => (
        <div key={r.label} className={cn("flex items-center justify-between gap-4 px-3", r.strong ? "my-1 rounded-md bg-[#e3f3f4] py-2" : "py-1.5")}>
          <span className={cn("text-[13px]", r.strong ? "font-semibold text-[#141517]" : r.muted ? "text-[#6e7780]" : "text-[#3f4650]")}>{r.label}</span>
          <span className={cn("tabular", r.strong ? "font-display text-[16px] font-bold text-[#0f7c80]" : r.muted ? "text-[13px] text-[#6e7780]" : "text-[13px] font-medium text-[#141517]")}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DocParagraph({ title, body, small }: { title: string; body: string; small?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6e7780]">{title}</div>
      <p className={cn("mt-1.5 whitespace-pre-wrap leading-relaxed text-[#3f4650]", small ? "text-[12px]" : "text-[13px]")}>{body}</p>
    </div>
  );
}

export function QuoteDocument({ doc }: { doc: QuoteDoc }) {
  const oneTime = doc.lines.filter((l) => l.pricingMode !== "MONTHLY");
  const monthly = doc.lines.filter((l) => l.pricingMode === "MONTHLY");
  const showDiscount = doc.lines.some((l) => l.discountPct > 0);
  const t = doc.totals;
  const rows = [
    { label: "Subtotal", value: money(t.subtotal, { cents: true }) },
    ...(t.discountTotal ? [{ label: "Discounts included", value: `-${money(t.discountTotal, { cents: true })}`, muted: true }] : []),
    ...(t.deliveryFee ? [{ label: "Delivery", value: money(t.deliveryFee, { cents: true }) }] : []),
    ...(t.installFee ? [{ label: "Installation and training", value: money(t.installFee, { cents: true }) }] : []),
    ...(t.taxRate ? [{ label: `Tax (${t.taxRate}%)`, value: money(t.taxAmount, { cents: true }) }] : []),
    { label: "Total due", value: money(t.total, { cents: true }), strong: true },
    ...(t.monthlyTotal ? [{ label: "Monthly service", value: `${money(t.monthlyTotal, { cents: true })} / mo`, strong: true }] : []),
  ];
  return (
    <DocShell kind="quote" number={doc.number} version={doc.version} footer={doc.footer}>
      <div className="flex flex-col gap-7">
        <DocMeta items={[{ label: "Date", value: date(doc.issuedAt) }, { label: "Valid until", value: doc.validUntil ? date(doc.validUntil) : "On request" }, { label: "Prepared by", value: doc.preparedBy?.name ?? doc.company.name }, { label: "Quote", value: doc.number }]} />
        <h2 className="font-display text-[20px] font-bold leading-tight text-[#141517]">{doc.title}</h2>
        <DocParties billTo={doc.billTo} from={doc.company} preparedBy={doc.preparedBy} />
        <DocTable title={monthly.length ? "One time" : undefined} lines={oneTime} showDiscount={showDiscount} />
        <DocTable title="Monthly service (Robot as a Service)" lines={monthly} showDiscount={showDiscount} monthly />
        <DocTotals rows={rows} />
        {doc.status === "ACCEPTED" && doc.acceptedByName ? (
          <div className="rounded-lg border border-[#b9dcc9] bg-[#dcefe4] px-4 py-3 text-[13px] font-semibold text-[#1f7a4d]">
            Accepted by {doc.acceptedByName} on {date(doc.respondedAt)}
          </div>
        ) : null}
        {doc.notes ? <DocParagraph title="Notes" body={doc.notes} /> : null}
        {doc.terms ? <DocParagraph title="Terms" body={doc.terms} small /> : null}
      </div>
    </DocShell>
  );
}

export function InvoiceDocument({ doc }: { doc: InvoiceDoc }) {
  const t = doc.totals;
  const rows = [
    { label: "Subtotal", value: money(t.subtotal, { cents: true }) },
    ...(t.taxRate ? [{ label: `Tax (${t.taxRate}%)`, value: money(t.taxAmount, { cents: true }) }] : []),
    { label: "Total", value: money(t.total, { cents: true }) },
    ...(t.amountPaid ? [{ label: "Paid", value: `-${money(t.amountPaid, { cents: true })}`, muted: true }] : []),
    { label: "Balance due", value: money(t.balanceDue, { cents: true }), strong: true },
  ];
  return (
    <DocShell kind="invoice" number={doc.number} footer={doc.footer}>
      <div className="flex flex-col gap-7">
        <DocMeta items={[{ label: "Issue date", value: date(doc.issueDate) }, { label: "Due date", value: doc.dueDate ? date(doc.dueDate) : "On receipt" }, { label: "Terms", value: doc.paymentTerms ?? "Net 30" }, { label: "Status", value: doc.status === "PAID" ? "Paid" : doc.status === "VOID" ? "Void" : doc.status === "OVERDUE" ? "Overdue" : "Open" }]} />
        <div>
          <h2 className="font-display text-[20px] font-bold leading-tight text-[#141517]">{doc.title ?? `Invoice ${doc.number}`}</h2>
          {doc.quoteNumber ? <p className="mt-1 text-[12.5px] text-[#6e7780]">From quote {doc.quoteNumber}</p> : null}
        </div>
        <DocParties billTo={doc.billTo} from={doc.company} preparedBy={doc.preparedBy} />
        <DocTable lines={doc.lines} showDiscount={false} />
        <DocTotals rows={rows} />
        {doc.status === "PAID" ? <div className="rounded-lg border border-[#b9dcc9] bg-[#dcefe4] px-4 py-3 text-[13px] font-semibold text-[#1f7a4d]">Paid in full{doc.paidAt ? ` on ${date(doc.paidAt)}` : ""}. Thank you.</div> : null}
        {doc.notes ? <DocParagraph title="Notes" body={doc.notes} /> : null}
        <DocParagraph title="How to pay" body={`Pay online from the link in your email, or send a check or wire to ${doc.company.name}, ${doc.company.address}. Please reference ${doc.number} with your payment. Questions: ${doc.company.email} or ${doc.company.phone}.`} small />
        {doc.payments.length ? (
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#6e7780]">Payments</div>
            <ul className="mt-1.5 divide-y divide-[#e6eeef] text-[13px]">
              {doc.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1.5">
                  <span className="text-[#3f4650]">
                    {date(p.paidAt)} · {p.method.toLowerCase().replace("_", " ")}
                    {p.reference ? ` · ref ${p.reference}` : ""}
                  </span>
                  <span className="font-medium tabular">{money(p.amount, { cents: true })}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </DocShell>
  );
}
