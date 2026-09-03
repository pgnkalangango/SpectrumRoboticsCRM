// Server side helpers shared by the quote and invoice actions, the approvals module, the public
// pages and the Stripe webhook. These are not server actions: they trust their caller, so every
// caller must have already checked access (session, token or webhook signature).

import { prisma } from "@/lib/prisma";
import { runEventAutomations } from "@/lib/automations/engine";
import { audit, logActivity, notify, notifyTier } from "@/lib/audit";
import { paymentStatus, roundCents } from "@/lib/quotes/math";
import type { PaymentMethod } from "@/generated/prisma/enums";

const INSTALL_STAGES = [
  { key: "payment", title: "Payment confirmed", done: false },
  { key: "ordered", title: "Robot ordered from OEM", done: false },
  { key: "trip", title: "Trip planned and approved", done: false },
  { key: "shipped", title: "Shipment tracked to site", done: false },
  { key: "installed", title: "Installed and mapped on site", done: false },
  { key: "trained", title: "Operators trained and certified", done: false },
  { key: "handoff", title: "Support info handed over, project closed", done: false },
];

// Mirrors moveDealStage in src/server/actions/crm.ts for flows with no signed in user
// (a client accepting a quote). Same side effects: stage change activity, setup task, install
// project, company to ACTIVE and a leadership notification when the deal is won.
export async function systemMoveDealStage(dealId: string, stageKey: string, actorId: string | null, opts: { onlyIfBefore?: boolean; onlyFrom?: string[]; lostReason?: string; actorLabel?: string } = {}) {
  const [deal, stage] = await Promise.all([prisma.deal.findUnique({ where: { id: dealId }, include: { stage: true, company: { select: { name: true } } } }), prisma.pipelineStage.findUnique({ where: { key: stageKey } })]);
  if (!deal || !stage) return false;
  if (deal.stageKey === stageKey) return false;
  if (deal.stage.isWon || deal.stage.isLost) return false;
  if (opts.onlyIfBefore && deal.stage.sortOrder >= stage.sortOrder) return false;
  if (opts.onlyFrom && !opts.onlyFrom.includes(deal.stageKey)) return false;
  await prisma.deal.update({
    where: { id: dealId },
    data: { stageKey, probability: stage.probability, lostReason: stage.isLost ? (opts.lostReason ?? null) : null, wonAt: stage.isWon ? new Date() : null, lostAt: stage.isLost ? new Date() : null, lastActivityAt: new Date() },
  });
  await logActivity({ type: "STAGE_CHANGE", subject: `${deal.stageKey.replace(/_/g, " ")} → ${stage.label}`, dealId, companyId: deal.companyId, contactId: deal.primaryContactId, actorId, actorLabel: opts.actorLabel ?? null, source: "system", metadata: { from: deal.stageKey, to: stageKey } });
  if (stage.isWon) {
    const setupSop = await prisma.sop.findUnique({ where: { slug: "admin-new-customer-setup" }, select: { id: true } });
    const owner = deal.ownerId ?? actorId;
    await prisma.task.create({ data: { title: `Set up the new customer: ${deal.company?.name ?? deal.name}`, taskType: "onboarding", priority: "HIGH", assigneeId: owner, createdById: actorId, dealId, companyId: deal.companyId, sopId: setupSop?.id, dueAt: new Date(Date.now() + 2 * 86400000), source: "automation" } });
    await prisma.project.create({ data: { name: `Install: ${deal.company?.name ?? deal.name}`, type: "install", status: "PLANNING", ownerId: owner, companyId: deal.companyId, dealId, stages: INSTALL_STAGES } });
    if (deal.companyId) await prisma.company.update({ where: { id: deal.companyId }, data: { status: "ACTIVE" } });
    await notifyTier({ minTier: "LEADERSHIP", type: "deal", title: `Deal won: ${deal.name}`, body: `${deal.company?.name ?? ""} · setup task and install project created`, link: `/hq/deals/${dealId}`, exceptUserId: actorId ?? undefined });
  }
  await runEventAutomations("deal.stage_changed", { dealId, from: deal.stageKey, to: stageKey });
  return true;
}

// Records a payment against an invoice and rolls the invoice forward. Used by the record payment
// action (staff) and the Stripe webhook (signature verified).
export async function applyPayment(params: { invoiceId: string; amount: number; method: PaymentMethod; reference?: string | null; paidAt?: Date; recordedById?: string | null; stripePaymentIntentId?: string | null; actorLabel?: string | null }) {
  const inv = await prisma.invoice.findUnique({ where: { id: params.invoiceId }, include: { payments: true, company: { select: { name: true } } } });
  if (!inv) throw new Error("Invoice not found.");
  if (inv.status === "VOID") throw new Error("This invoice is void. Payments cannot be recorded on it.");
  const amount = roundCents(params.amount);
  if (!(amount > 0)) throw new Error("Enter an amount above zero.");
  if (params.stripePaymentIntentId) {
    const dup = inv.payments.find((p) => p.stripePaymentIntentId === params.stripePaymentIntentId);
    if (dup) return { payment: dup, invoice: inv, duplicate: true as const };
  }
  const payment = await prisma.payment.create({ data: { invoiceId: inv.id, amount, method: params.method, reference: params.reference ?? null, paidAt: params.paidAt ?? new Date(), recordedById: params.recordedById ?? null, stripePaymentIntentId: params.stripePaymentIntentId ?? null } });
  const amountPaid = roundCents(inv.payments.reduce((a, p) => a + Number(p.amount), 0) + amount);
  const total = Number(inv.total);
  const balanceDue = roundCents(Math.max(0, total - amountPaid));
  const ps = paymentStatus(total, amountPaid);
  const status = ps === "PAID" ? "PAID" : ps === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : inv.status;
  const updated = await prisma.invoice.update({ where: { id: inv.id }, data: { amountPaid, balanceDue, status, paidAt: ps === "PAID" ? (params.paidAt ?? new Date()) : null } });
  await logActivity({
    type: "PAYMENT",
    subject: `${ps === "PAID" ? "Paid in full" : "Payment received"}: ${usd(amount)} on ${inv.number}`,
    body: [params.method.toLowerCase().replace("_", " "), params.reference ? `ref ${params.reference}` : null, balanceDue > 0 ? `${usd(balanceDue)} still due` : null].filter(Boolean).join(" · "),
    invoiceId: inv.id,
    companyId: inv.companyId,
    contactId: inv.contactId,
    dealId: inv.dealId,
    actorId: params.recordedById ?? null,
    actorLabel: params.actorLabel ?? (params.recordedById ? null : "Stripe"),
    source: params.recordedById ? "manual" : "webhook",
    direction: "INBOUND",
    occurredAt: params.paidAt ?? new Date(),
  });
  if (inv.ownerId && inv.ownerId !== params.recordedById) await notify({ userId: inv.ownerId, type: "info", title: `${usd(amount)} received on ${inv.number}`, body: `${inv.company?.name ?? "Customer"} · ${ps === "PAID" ? "paid in full" : `${usd(balanceDue)} still due`}`, link: `/hq/invoices/${inv.id}` });
  await audit({ actorId: params.recordedById ?? null, action: "payment", entityType: "Invoice", entityId: inv.id, after: { amount, method: params.method, reference: params.reference ?? null, status } });
  return { payment, invoice: updated, duplicate: false as const };
}

// Decides a QUOTE_DISCOUNT approval. Shared by the quote actions and the approvals screen so both
// paths keep the quote, the approval row and the requester in sync.
export async function decideQuoteDiscount(params: { quoteId: string; decision: "APPROVED" | "REJECTED"; deciderId: string; note?: string | null; approvalId?: string | null }) {
  const quote = await prisma.quote.findUnique({ where: { id: params.quoteId }, select: { id: true, number: true, title: true, status: true, ownerId: true, companyId: true, contactId: true, dealId: true } });
  if (!quote) throw new Error("Quote not found.");
  const approved = params.decision === "APPROVED";
  await prisma.quote.update({ where: { id: quote.id }, data: approved ? { status: "APPROVED", approvedById: params.deciderId, approvedAt: new Date() } : { status: "DRAFT", approvedById: null, approvedAt: null } });
  const where = params.approvalId ? { id: params.approvalId } : { entityType: "Quote", entityId: quote.id, type: "QUOTE_DISCOUNT" as const, status: "PENDING" as const };
  await prisma.approval.updateMany({ where, data: { status: params.decision, decidedById: params.deciderId, decidedAt: new Date(), decisionNote: params.note ?? null } });
  await logActivity({ type: "SYSTEM", subject: approved ? `Discount approved on ${quote.number}` : `Discount not approved on ${quote.number}`, body: params.note ?? undefined, quoteId: quote.id, companyId: quote.companyId, contactId: quote.contactId, dealId: quote.dealId, actorId: params.deciderId, source: "system" });
  if (quote.ownerId && quote.ownerId !== params.deciderId) {
    await notify({ userId: quote.ownerId, type: "approval", title: approved ? `Discount approved: ${quote.number}` : `Discount not approved: ${quote.number}`, body: approved ? "You can send the quote now." : (params.note ?? "Adjust the pricing and ask again."), link: `/hq/quotes/${quote.id}` });
  }
  await audit({ actorId: params.deciderId, action: approved ? "approve" : "reject", entityType: "Quote", entityId: quote.id, after: { status: approved ? "APPROVED" : "DRAFT", note: params.note ?? null } });
}

export async function expireQuotesCore(): Promise<number> {
  const r = await prisma.quote.updateMany({ where: { status: { in: ["SENT", "VIEWED"] }, validUntil: { lt: new Date() } }, data: { status: "EXPIRED" } });
  return r.count;
}

export async function markOverdueCore(graceDays = 0): Promise<number> {
  const cutoff = new Date(Date.now() - graceDays * 86400000);
  const r = await prisma.invoice.updateMany({ where: { status: { in: ["SENT", "VIEWED"] }, dueDate: { lt: cutoff }, balanceDue: { gt: 0 } }, data: { status: "OVERDUE" } });
  return r.count;
}

export function usd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export function clientIp(h: Headers): string | null {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? null;
}

// First open of a public quote or invoice page. Idempotent: only SENT flips to VIEWED.
export async function markQuoteViewedCore(quoteId: string) {
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, include: { contact: { select: { firstName: true, lastName: true } } } });
  if (!q || q.status !== "SENT") return false;
  await prisma.quote.update({ where: { id: q.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  const who = q.contact ? `${q.contact.firstName} ${q.contact.lastName ?? ""}`.trim() : "Client";
  await logActivity({ type: "QUOTE_VIEWED", subject: `Quote ${q.number} opened`, quoteId: q.id, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId, actorLabel: who, source: "system", direction: "INBOUND" });
  if (q.ownerId) await notify({ userId: q.ownerId, type: "deal", title: `Quote ${q.number} was opened`, body: `${who} just viewed ${q.title}`, link: `/hq/quotes/${q.id}` });
  return true;
}

export async function markInvoiceViewedCore(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { contact: { select: { firstName: true, lastName: true } } } });
  if (!inv || inv.status !== "SENT") return false;
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: "VIEWED", viewedAt: new Date() } });
  const who = inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName ?? ""}`.trim() : "Client";
  await logActivity({ type: "SYSTEM", subject: `Invoice ${inv.number} opened`, invoiceId: inv.id, companyId: inv.companyId, contactId: inv.contactId, dealId: inv.dealId, actorLabel: who, source: "system", direction: "INBOUND" });
  return true;
}
