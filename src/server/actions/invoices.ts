"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { audit, logActivity } from "@/lib/audit";
import { getSetting, nextNumber } from "@/lib/settings";
import { randomToken } from "@/lib/crypto";
import { appUrl, button, sendSystemMail } from "@/lib/mailer";
import { fullName } from "@/lib/utils";
import { computeInvoiceTotals, roundCents } from "@/lib/quotes/math";
import { applyPayment, markOverdueCore, usd } from "@/lib/quotes/core";
import { allowRequest } from "@/lib/quotes/ratelimit";
import { createStripeCheckout } from "@/lib/stripe";
import { syncInvoice, syncPayment } from "@/lib/quickbooks";
import type { PaymentMethod, PricingMode } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  if (e instanceof Error && e.message && !e.message.includes("prisma")) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

function netDays(terms: string | null | undefined, fallback = 30): number {
  const m = /net\s*(\d+)/i.exec(terms ?? "");
  if (m) return Number(m[1]);
  if (/receipt/i.test(terms ?? "")) return 0;
  return fallback;
}

export async function createInvoiceFromQuote(quoteId: string): Promise<Result<{ id: string; number: string }>> {
  try {
    const user = await actionStaff();
    const q = await prisma.quote.findUnique({ where: { id: quoteId }, include: { lines: { orderBy: { sortOrder: "asc" } }, invoices: { select: { id: true, number: true, status: true } }, company: { select: { name: true } } } });
    if (!q) return { ok: false, error: "Quote not found." };
    if (q.status !== "ACCEPTED") return { ok: false, error: "Only an accepted quote can be invoiced." };
    const live = q.invoices.find((i) => i.status !== "VOID");
    if (live) return { ok: false, error: `Invoice ${live.number} already exists for this quote.` };
    const settings = await getSetting("invoices");
    const lines: { description: string; quantity: number; unitPrice: number; pricingMode: PricingMode }[] = [];
    for (const l of q.lines) {
      const disc = Number(l.discountPct);
      const unit = roundCents(Number(l.unitPrice) * (1 - disc / 100));
      if (l.pricingMode === "MONTHLY") lines.push({ description: `${l.description}, first month of service${disc ? ` (${disc}% discount applied)` : ""}`, quantity: l.quantity, unitPrice: unit, pricingMode: "MONTHLY" });
      else lines.push({ description: `${l.description}${disc ? ` (${disc}% discount applied)` : ""}`, quantity: l.quantity, unitPrice: unit, pricingMode: "ONE_TIME" });
    }
    if (Number(q.deliveryFee) > 0) lines.push({ description: "Delivery", quantity: 1, unitPrice: Number(q.deliveryFee), pricingMode: "ONE_TIME" });
    if (Number(q.installFee) > 0) lines.push({ description: "Installation and training", quantity: 1, unitPrice: Number(q.installFee), pricingMode: "ONE_TIME" });
    const totals = computeInvoiceTotals(lines, Number(q.taxRate));
    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + netDays(settings.defaultTerms) * 86400000);
    const number = await nextNumber("invoices");
    const inv = await prisma.invoice.create({
      data: {
        number,
        title: q.title,
        quoteId: q.id,
        companyId: q.companyId,
        contactId: q.contactId,
        dealId: q.dealId,
        ownerId: q.ownerId ?? user.id,
        issueDate,
        dueDate,
        status: "DRAFT",
        subtotal: totals.subtotal,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        amountPaid: 0,
        balanceDue: totals.total,
        paymentTerms: settings.defaultTerms,
        publicToken: randomToken(24),
        lines: { create: lines.map((l, i) => ({ ...l, total: totals.lineTotals[i], sortOrder: i })) },
      },
    });
    await logActivity({ type: "SYSTEM", subject: `Invoice ${number} created from quote ${q.number}`, body: `${usd(totals.total)} due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, invoiceId: inv.id, quoteId: q.id, companyId: q.companyId, contactId: q.contactId, dealId: q.dealId, actorId: user.id, source: "system" });
    await prisma.task.updateMany({ where: { title: `Invoice the accepted quote ${q.number}`, status: { in: ["TODO", "IN_PROGRESS"] } }, data: { status: "DONE", completedAt: new Date() } });
    revalidatePath("/hq/invoices");
    revalidatePath(`/hq/quotes/${q.id}`);
    return { ok: true, data: { id: inv.id, number } };
  } catch (e) {
    return fail(e);
  }
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));
const invoiceLineSchema = z.object({
  description: z.string().min(1, "Every line needs a description.").max(500),
  quantity: z.coerce.number().int().min(1).max(10000),
  unitPrice: z.coerce.number().min(0),
  pricingMode: z.enum(["ONE_TIME", "MONTHLY"]).default("ONE_TIME"),
});
const invoiceSchema = z.object({
  title: opt(200),
  issueDate: opt(30),
  dueDate: opt(30),
  paymentTerms: opt(80),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().max(5000).optional().nullable(),
  companyId: opt(),
  contactId: opt(),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line.").max(100),
});
export type InvoiceInput = z.input<typeof invoiceSchema>;

export async function saveInvoice(input: InvoiceInput & { id: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = invoiceSchema.parse(input);
    const inv = await prisma.invoice.findUnique({ where: { id: input.id } });
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (inv.status !== "DRAFT") return { ok: false, error: "Only draft invoices can be edited. Void it and create a new one if the amounts are wrong." };
    const totals = computeInvoiceTotals(d.lines, d.taxRate);
    const amountPaid = Number(inv.amountPaid);
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          title: d.title,
          issueDate: d.issueDate ? new Date(d.issueDate) : inv.issueDate,
          dueDate: d.dueDate ? new Date(d.dueDate) : inv.dueDate,
          paymentTerms: d.paymentTerms,
          taxRate: totals.taxRate,
          notes: d.notes?.trim() || null,
          companyId: d.companyId ?? inv.companyId,
          contactId: d.contactId ?? inv.contactId,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          balanceDue: roundCents(Math.max(0, totals.total - amountPaid)),
        },
      });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: inv.id } });
      await tx.invoiceLine.createMany({ data: d.lines.map((l, i) => ({ invoiceId: inv.id, description: l.description.trim(), quantity: l.quantity, unitPrice: l.unitPrice, pricingMode: l.pricingMode as PricingMode, total: totals.lineTotals[i], sortOrder: i })) });
    });
    await audit({ actorId: user.id, action: "update", entityType: "Invoice", entityId: inv.id, before: { total: Number(inv.total) }, after: { total: totals.total } });
    revalidatePath("/hq/invoices");
    revalidatePath(`/hq/invoices/${inv.id}`);
    return { ok: true, data: { id: inv.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function sendInvoice(id: string, opts: { message?: string } = {}): Promise<Result<{ token: string; delivered: boolean; to: string }>> {
  try {
    const user = await actionStaff();
    const inv = await prisma.invoice.findUnique({ where: { id }, include: { contact: true, company: { select: { name: true } }, owner: { select: { name: true, title: true, signatureHtml: true } } } });
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (inv.status === "VOID") return { ok: false, error: "This invoice is void." };
    if (inv.status === "PAID") return { ok: false, error: "This invoice is already paid." };
    if (!inv.contact?.email) return { ok: false, error: "Pick a contact with an email address first." };
    const resend = inv.status !== "DRAFT";
    const token = inv.publicToken ?? randomToken(24);
    await prisma.invoice.update({ where: { id }, data: { publicToken: token, ...(resend ? {} : { status: "SENT", sentAt: new Date() }) } });
    const link = appUrl(`/i/${token}`);
    const sig = inv.owner?.signatureHtml?.trim() || `<p style="margin-top:16px">${inv.owner?.name ?? user.name}${inv.owner?.title ? `<br/>${inv.owner.title}` : ""}<br/>Spectrum Robotics</p>`;
    const due = inv.dueDate ? inv.dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "on receipt";
    const intro = opts.message?.trim() ? `<p>${escapeHtml(opts.message.trim()).replace(/\n/g, "<br/>")}</p>` : resend ? `<p>A friendly reminder that invoice ${inv.number} has a balance of ${usd(Number(inv.balanceDue))}, due ${due}. You can pay online from the link below.</p>` : `<p>Thank you for your business. Invoice ${inv.number}${inv.title ? ` for ${escapeHtml(inv.title)}` : ""} is attached online. The balance of ${usd(Number(inv.balanceDue))} is due ${due}. You can pay by card or bank transfer from the link below.</p>`;
    const mail = await sendSystemMail({
      to: inv.contact.email,
      subject: `${resend ? "Reminder: " : ""}Invoice ${inv.number} from Spectrum Robotics${inv.title ? `: ${inv.title}` : ""}`,
      html: `<p>Hi ${escapeHtml(inv.contact.firstName)},</p>${intro}${button(link, "View and pay invoice")}${sig}`,
      text: `Hi ${inv.contact.firstName},\n\nInvoice ${inv.number}: ${usd(Number(inv.balanceDue))} due ${due}. View and pay: ${link}\n\n${inv.owner?.name ?? user.name}\nSpectrum Robotics`,
    });
    await logActivity({ type: "INVOICE_SENT", subject: `${resend ? "Invoice reminder sent" : "Invoice sent"}: ${inv.number} to ${inv.contact.email}`, body: opts.message?.trim() || undefined, invoiceId: inv.id, quoteId: inv.quoteId, contactId: inv.contactId, companyId: inv.companyId, dealId: inv.dealId, actorId: user.id, source: "system", direction: "OUTBOUND", participants: [inv.contact.email] });
    await audit({ actorId: user.id, action: "send", entityType: "Invoice", entityId: inv.id, after: { to: inv.contact.email, resend } });
    revalidatePath("/hq/invoices");
    revalidatePath(`/hq/invoices/${id}`);
    return { ok: true, data: { token, delivered: mail.delivered, to: inv.contact.email } };
  } catch (e) {
    return fail(e);
  }
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount above zero."),
  method: z.enum(["CARD", "ACH", "CHECK", "WIRE", "CASH", "OTHER"]).default("OTHER"),
  reference: opt(120),
  paidAt: opt(30),
});
export type PaymentInput = z.input<typeof paymentSchema>;

export async function recordPayment(invoiceId: string, input: PaymentInput): Promise<Result<{ paymentId: string; status: string }>> {
  try {
    const user = await actionStaff();
    const d = paymentSchema.parse(input);
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { balanceDue: true, status: true } });
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (d.amount > Number(inv.balanceDue) + 0.005) return { ok: false, error: `That is more than the ${usd(Number(inv.balanceDue))} still due. Record the balance, then handle the overpayment separately.` };
    const r = await applyPayment({ invoiceId, amount: d.amount, method: d.method as PaymentMethod, reference: d.reference, paidAt: d.paidAt ? new Date(d.paidAt) : new Date(), recordedById: user.id });
    revalidatePath("/hq/invoices");
    revalidatePath(`/hq/invoices/${invoiceId}`);
    return { ok: true, data: { paymentId: r.payment.id, status: r.invoice.status } };
  } catch (e) {
    return fail(e);
  }
}

export async function voidInvoice(id: string, reason?: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const inv = await prisma.invoice.findUnique({ where: { id }, select: { status: true, number: true, amountPaid: true, companyId: true, contactId: true, dealId: true, total: true } });
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (inv.status === "VOID") return { ok: true };
    if (Number(inv.amountPaid) > 0) return { ok: false, error: "This invoice has payments on it. Refund them first, then void." };
    await prisma.invoice.update({ where: { id }, data: { status: "VOID", balanceDue: 0 } });
    await logActivity({ type: "SYSTEM", subject: `Invoice ${inv.number} voided`, body: reason?.trim() || undefined, invoiceId: id, companyId: inv.companyId, contactId: inv.contactId, dealId: inv.dealId, actorId: user.id, source: "system" });
    await audit({ actorId: user.id, action: "void", entityType: "Invoice", entityId: id, before: { status: inv.status, total: Number(inv.total) }, after: { status: "VOID", reason: reason ?? null } });
    revalidatePath("/hq/invoices");
    revalidatePath(`/hq/invoices/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markOverdue(): Promise<Result<{ count: number }>> {
  try {
    await actionStaff();
    const settings = await getSetting("invoices");
    const count = await markOverdueCore(settings.overdueGraceDays ?? 0);
    return { ok: true, data: { count } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDraftInvoice(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const inv = await prisma.invoice.findUnique({ where: { id }, select: { status: true, number: true } });
    if (!inv) return { ok: true };
    if (inv.status !== "DRAFT") return { ok: false, error: "Only drafts can be deleted. Void the invoice instead." };
    await prisma.invoice.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Invoice", entityId: id, before: inv });
    revalidatePath("/hq/invoices");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Public: /i/<token> on first load.
export async function markInvoiceViewed(token: string): Promise<Result> {
  try {
    if (!token || !allowRequest(`i:${token}`)) return { ok: false, error: "Too many requests." };
    const inv = await prisma.invoice.findUnique({ where: { publicToken: token }, include: { contact: { select: { firstName: true, lastName: true } } } });
    if (!inv) return { ok: false, error: "Not found." };
    if (inv.status !== "SENT") return { ok: true };
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "VIEWED", viewedAt: new Date() } });
    await logActivity({ type: "SYSTEM", subject: `Invoice ${inv.number} opened`, invoiceId: inv.id, companyId: inv.companyId, contactId: inv.contactId, dealId: inv.dealId, actorLabel: inv.contact ? fullName(inv.contact) : "Client", source: "system", direction: "INBOUND" });
    revalidatePath(`/hq/invoices/${inv.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Public: starts a Stripe Checkout session for the invoice behind the token.
export async function startCheckout(token: string): Promise<Result<{ url: string }>> {
  try {
    if (!token || !allowRequest(`i:${token}`)) return { ok: false, error: "Too many requests. Please wait a minute and try again." };
    const inv = await prisma.invoice.findUnique({ where: { publicToken: token }, select: { id: true } });
    if (!inv) return { ok: false, error: "This invoice link is not valid." };
    const r = await createStripeCheckout(inv.id);
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: { url: r.data.url } };
  } catch (e) {
    return fail(e);
  }
}

export async function syncInvoiceToQuickBooks(id: string): Promise<Result<{ quickbooksInvoiceId: string }>> {
  try {
    const user = await actionStaff("OWNER");
    const r = await syncInvoice(id);
    if (!r.ok) return { ok: false, error: r.error };
    await audit({ actorId: user.id, action: "sync", entityType: "Invoice", entityId: id, after: { quickbooksInvoiceId: r.data.quickbooksInvoiceId } });
    revalidatePath(`/hq/invoices/${id}`);
    return { ok: true, data: r.data };
  } catch (e) {
    return fail(e);
  }
}

export async function syncPaymentToQuickBooks(paymentId: string): Promise<Result<{ quickbooksPaymentId: string }>> {
  try {
    const user = await actionStaff("OWNER");
    const r = await syncPayment(paymentId);
    if (!r.ok) return { ok: false, error: r.error };
    await audit({ actorId: user.id, action: "sync", entityType: "Payment", entityId: paymentId, after: r.data });
    const p = await prisma.payment.findUnique({ where: { id: paymentId }, select: { invoiceId: true } });
    if (p) revalidatePath(`/hq/invoices/${p.invoiceId}`);
    return { ok: true, data: r.data };
  } catch (e) {
    return fail(e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
