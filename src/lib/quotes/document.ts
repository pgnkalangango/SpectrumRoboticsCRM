// Plain, serializable document shapes shared by the HTML preview, the PDF generator and the
// public pages. Never include internal notes or costs here: these shapes are shown to clients.

import { DEFAULT_SETTINGS } from "@/lib/settings";
import { num, roundCents } from "@/lib/quotes/math";

export type DocLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  pricingMode: "ONE_TIME" | "MONTHLY";
  discountPct: number;
  total: number;
};

export type DocParty = {
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressLines: string[];
};

export type CompanyInfo = { name: string; address: string; phone: string; email: string; website: string };

export type PreparedBy = { name: string; email: string; title: string | null; phone: string | null };

export type QuoteDoc = {
  kind: "quote";
  id: string;
  number: string;
  version: number;
  title: string;
  status: string;
  issuedAt: string; // ISO
  validUntil: string | null;
  billTo: DocParty;
  lines: DocLine[];
  totals: { subtotal: number; discountTotal: number; deliveryFee: number; installFee: number; taxRate: number; taxAmount: number; oneTimeTotal: number; monthlyTotal: number; total: number };
  notes: string | null;
  terms: string | null;
  footer: string;
  preparedBy: PreparedBy | null;
  company: CompanyInfo;
  acceptedByName: string | null;
  respondedAt: string | null;
  viewedAt: string | null;
  sentAt: string | null;
  declineReason: string | null;
};

export type DocPayment = { id: string; amount: number; method: string; paidAt: string; reference: string | null };

export type InvoiceDoc = {
  kind: "invoice";
  id: string;
  number: string;
  title: string | null;
  status: string;
  issueDate: string;
  dueDate: string | null;
  paymentTerms: string | null;
  quoteNumber: string | null;
  billTo: DocParty;
  lines: DocLine[];
  totals: { subtotal: number; taxRate: number; taxAmount: number; total: number; amountPaid: number; balanceDue: number };
  notes: string | null;
  footer: string;
  preparedBy: PreparedBy | null;
  company: CompanyInfo;
  payments: DocPayment[];
  paidAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
};

export type AnyDoc = QuoteDoc | InvoiceDoc;

export function companyInfo(settings?: Partial<CompanyInfo> | null): CompanyInfo {
  const c = DEFAULT_SETTINGS.company;
  return { name: settings?.name ?? c.name, address: settings?.address ?? c.address, phone: settings?.phone ?? c.phone, email: settings?.email ?? c.email, website: settings?.website ?? c.website };
}

type PartySource = {
  company?: { name: string; addressStreet?: string | null; addressCity?: string | null; addressState?: string | null; addressZip?: string | null; phone?: string | null } | null;
  contact?: { firstName: string; lastName?: string | null; email?: string | null; phoneMobile?: string | null; phoneOffice?: string | null; companyName?: string | null; addressStreet?: string | null; addressCity?: string | null; addressState?: string | null; addressZip?: string | null } | null;
};

export function partyFrom(src: PartySource): DocParty {
  const co = src.company;
  const ct = src.contact;
  const street = co?.addressStreet ?? ct?.addressStreet ?? null;
  const cityLine = [co?.addressCity ?? ct?.addressCity, [co?.addressState ?? ct?.addressState, co?.addressZip ?? ct?.addressZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return {
    name: co?.name ?? ct?.companyName ?? (ct ? `${ct.firstName} ${ct.lastName ?? ""}`.trim() : "Customer"),
    contactName: ct ? `${ct.firstName} ${ct.lastName ?? ""}`.trim() : null,
    email: ct?.email ?? null,
    phone: ct?.phoneMobile ?? ct?.phoneOffice ?? co?.phone ?? null,
    addressLines: [street, cityLine].filter((s): s is string => !!s),
  };
}

type QuoteRecord = {
  id: string;
  number: string;
  version: number;
  title: string;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
  viewedAt: Date | null;
  respondedAt: Date | null;
  validUntil: Date | null;
  subtotal: unknown;
  discountTotal: unknown;
  deliveryFee: unknown;
  installFee: unknown;
  taxRate: unknown;
  taxAmount: unknown;
  oneTimeTotal: unknown;
  monthlyTotal: unknown;
  total: unknown;
  notes: string | null;
  terms: string | null;
  acceptedByName: string | null;
  declineReason: string | null;
  lines: { description: string; quantity: number; unitPrice: unknown; pricingMode: "ONE_TIME" | "MONTHLY"; discountPct: unknown; total: unknown; sortOrder: number }[];
  owner?: { name: string; email: string; title?: string | null; phone?: string | null } | null;
} & PartySource;

export function quoteToDoc(q: QuoteRecord, opts: { footer?: string; company?: Partial<CompanyInfo> | null } = {}): QuoteDoc {
  return {
    kind: "quote",
    id: q.id,
    number: q.number,
    version: q.version,
    title: q.title,
    status: q.status,
    issuedAt: (q.sentAt ?? q.createdAt).toISOString(),
    validUntil: q.validUntil?.toISOString() ?? null,
    billTo: partyFrom(q),
    lines: [...q.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: num(l.unitPrice), pricingMode: l.pricingMode, discountPct: num(l.discountPct), total: num(l.total) })),
    totals: {
      subtotal: num(q.subtotal),
      discountTotal: num(q.discountTotal),
      deliveryFee: num(q.deliveryFee),
      installFee: num(q.installFee),
      taxRate: num(q.taxRate),
      taxAmount: num(q.taxAmount),
      oneTimeTotal: num(q.oneTimeTotal),
      monthlyTotal: num(q.monthlyTotal),
      total: num(q.total),
    },
    notes: q.notes,
    terms: q.terms,
    footer: opts.footer ?? DEFAULT_SETTINGS.quotes.pdfFooter,
    preparedBy: q.owner ? { name: q.owner.name, email: q.owner.email, title: q.owner.title ?? null, phone: q.owner.phone ?? null } : null,
    company: companyInfo(opts.company),
    acceptedByName: q.acceptedByName,
    respondedAt: q.respondedAt?.toISOString() ?? null,
    viewedAt: q.viewedAt?.toISOString() ?? null,
    sentAt: q.sentAt?.toISOString() ?? null,
    declineReason: q.declineReason,
  };
}

type InvoiceRecord = {
  id: string;
  number: string;
  title: string | null;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  paymentTerms: string | null;
  subtotal: unknown;
  taxRate: unknown;
  taxAmount: unknown;
  total: unknown;
  amountPaid: unknown;
  balanceDue: unknown;
  notes: string | null;
  paidAt: Date | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  quote?: { number: string } | null;
  lines: { description: string; quantity: number; unitPrice: unknown; pricingMode: "ONE_TIME" | "MONTHLY"; total: unknown; sortOrder: number }[];
  payments?: { id: string; amount: unknown; method: string; paidAt: Date; reference: string | null }[];
  owner?: { name: string; email: string; title?: string | null; phone?: string | null } | null;
} & PartySource;

export function invoiceToDoc(inv: InvoiceRecord, opts: { footer?: string; company?: Partial<CompanyInfo> | null } = {}): InvoiceDoc {
  return {
    kind: "invoice",
    id: inv.id,
    number: inv.number,
    title: inv.title,
    status: inv.status,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate?.toISOString() ?? null,
    paymentTerms: inv.paymentTerms,
    quoteNumber: inv.quote?.number ?? null,
    billTo: partyFrom(inv),
    lines: [...inv.lines].sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: num(l.unitPrice), pricingMode: l.pricingMode, discountPct: 0, total: num(l.total) })),
    totals: { subtotal: num(inv.subtotal), taxRate: num(inv.taxRate), taxAmount: num(inv.taxAmount), total: num(inv.total), amountPaid: num(inv.amountPaid), balanceDue: roundCents(num(inv.balanceDue)) },
    notes: inv.notes,
    footer: opts.footer ?? DEFAULT_SETTINGS.quotes.pdfFooter,
    preparedBy: inv.owner ? { name: inv.owner.name, email: inv.owner.email, title: inv.owner.title ?? null, phone: inv.owner.phone ?? null } : null,
    company: companyInfo(opts.company),
    payments: (inv.payments ?? []).map((p) => ({ id: p.id, amount: num(p.amount), method: p.method, paidAt: p.paidAt.toISOString(), reference: p.reference })),
    paidAt: inv.paidAt?.toISOString() ?? null,
    sentAt: inv.sentAt?.toISOString() ?? null,
    viewedAt: inv.viewedAt?.toISOString() ?? null,
  };
}
