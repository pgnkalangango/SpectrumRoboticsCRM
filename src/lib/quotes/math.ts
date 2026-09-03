// Pure quote and invoice math. No Prisma, no React, so it can be unit tested and shared by the
// builder (live totals), the server actions (authoritative totals) and the PDF generator.

export type PricingModeValue = "ONE_TIME" | "MONTHLY";

export type LineInput = {
  quantity: number;
  unitPrice: number;
  pricingMode: PricingModeValue;
  discountPct?: number | null;
};

export type QuoteInput = {
  lines: LineInput[];
  deliveryFee?: number | null;
  installFee?: number | null;
  taxRate?: number | null; // percent, for example 8.25
};

export type LineTotals = {
  gross: number; // quantity * unitPrice
  discount: number; // amount taken off by the line discount
  total: number; // gross - discount
};

export type QuoteTotals = {
  subtotal: number; // one time lines after line discounts
  monthlyTotal: number; // monthly lines after line discounts
  discountTotal: number; // sum of line discounts (one time and monthly)
  deliveryFee: number;
  installFee: number;
  taxable: number; // subtotal + delivery + install
  taxRate: number;
  taxAmount: number;
  oneTimeTotal: number; // taxable + tax
  total: number; // same as oneTimeTotal; monthly is shown separately
  lineTotals: LineTotals[];
};

export function roundCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  // Add a tiny epsilon so values like 1.005 round the way people expect.
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function lineTotals(line: LineInput): LineTotals {
  const quantity = Math.max(0, num(line.quantity));
  const unitPrice = num(line.unitPrice);
  const pct = Math.min(100, Math.max(0, num(line.discountPct)));
  const gross = roundCents(quantity * unitPrice);
  const discount = roundCents((gross * pct) / 100);
  return { gross, discount, total: roundCents(gross - discount) };
}

export function computeQuoteTotals(input: QuoteInput): QuoteTotals {
  const lineTotalsList = input.lines.map(lineTotals);
  let subtotal = 0;
  let monthlyTotal = 0;
  let discountTotal = 0;
  input.lines.forEach((line, i) => {
    const t = lineTotalsList[i];
    discountTotal += t.discount;
    if (line.pricingMode === "MONTHLY") monthlyTotal += t.total;
    else subtotal += t.total;
  });
  subtotal = roundCents(subtotal);
  monthlyTotal = roundCents(monthlyTotal);
  discountTotal = roundCents(discountTotal);
  const deliveryFee = roundCents(Math.max(0, num(input.deliveryFee)));
  const installFee = roundCents(Math.max(0, num(input.installFee)));
  const taxRate = Math.max(0, num(input.taxRate));
  const taxable = roundCents(subtotal + deliveryFee + installFee);
  const taxAmount = roundCents((taxable * taxRate) / 100);
  const oneTimeTotal = roundCents(taxable + taxAmount);
  return { subtotal, monthlyTotal, discountTotal, deliveryFee, installFee, taxable, taxRate, taxAmount, oneTimeTotal, total: oneTimeTotal, lineTotals: lineTotalsList };
}

// Accepts the shape stored in the database (Decimal strings, nullable fees) and returns totals.
export function totalsFromQuoteRecord(q: { lines: { quantity: unknown; unitPrice: unknown; pricingMode: PricingModeValue; discountPct?: unknown }[]; deliveryFee?: unknown; installFee?: unknown; taxRate?: unknown }): QuoteTotals {
  return computeQuoteTotals({
    lines: q.lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), pricingMode: l.pricingMode, discountPct: num(l.discountPct) })),
    deliveryFee: num(q.deliveryFee),
    installFee: num(q.installFee),
    taxRate: num(q.taxRate),
  });
}

export function hasDiscount(q: { lines: { discountPct?: unknown }[] }): boolean {
  return q.lines.some((l) => num(l.discountPct) > 0);
}

export function maxDiscountPct(q: { lines: { discountPct?: unknown }[] }): number {
  return q.lines.reduce((m, l) => Math.max(m, num(l.discountPct)), 0);
}

// Invoices: every line is billed now. Monthly lines are the first month of service and are not
// taxed; one time goods and services are taxed at the carried over rate.
export type InvoiceLineInput = { quantity: number; unitPrice: number; pricingMode: PricingModeValue };

export type InvoiceTotals = {
  subtotal: number; // all lines
  taxable: number; // one time lines only
  taxRate: number;
  taxAmount: number;
  total: number;
  lineTotals: number[];
};

export function computeInvoiceTotals(lines: InvoiceLineInput[], taxRate: unknown): InvoiceTotals {
  const rate = Math.max(0, num(taxRate));
  const totals = lines.map((l) => roundCents(Math.max(0, num(l.quantity)) * num(l.unitPrice)));
  let subtotal = 0;
  let taxable = 0;
  lines.forEach((l, i) => {
    subtotal += totals[i];
    if (l.pricingMode !== "MONTHLY") taxable += totals[i];
  });
  subtotal = roundCents(subtotal);
  taxable = roundCents(taxable);
  const taxAmount = roundCents((taxable * rate) / 100);
  return { subtotal, taxable, taxRate: rate, taxAmount, total: roundCents(subtotal + taxAmount), lineTotals: totals };
}

export function paymentStatus(total: number, amountPaid: number): "PAID" | "PARTIALLY_PAID" | "UNPAID" {
  const paid = roundCents(amountPaid);
  if (paid <= 0) return "UNPAID";
  if (paid + 0.005 >= roundCents(total)) return "PAID";
  return "PARTIALLY_PAID";
}
