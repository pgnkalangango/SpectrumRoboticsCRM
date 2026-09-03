"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit, logActivity, notify, notifyTier } from "@/lib/audit";
import { getSetting, nextNumber } from "@/lib/settings";
import { randomToken } from "@/lib/crypto";
import { appUrl, button, sendSystemMail } from "@/lib/mailer";
import { fullName } from "@/lib/utils";
import { computeQuoteTotals, hasDiscount, maxDiscountPct } from "@/lib/quotes/math";
import { clientIp, decideQuoteDiscount, expireQuotesCore, systemMoveDealStage, usd } from "@/lib/quotes/core";
import { allowRequest } from "@/lib/quotes/ratelimit";
import type { PricingMode, QuoteStatus } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));

const lineSchema = z.object({
  productId: opt(),
  description: z.string().min(1, "Every line needs a description.").max(500),
  quantity: z.coerce.number().int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(10000),
  unitPrice: z.coerce.number().min(0, "Unit price cannot be negative."),
  pricingMode: z.enum(["ONE_TIME", "MONTHLY"]).default("ONE_TIME"),
  discountPct: z.coerce.number().min(0).max(100, "Discount cannot be more than 100%.").default(0),
});

const quoteSchema = z.object({
  title: z.string().min(1, "Give the quote a title.").max(200),
  companyId: opt(),
  contactId: opt(),
  dealId: opt(),
  ownerId: opt(),
  validUntil: opt(30),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  deliveryFee: z.coerce.number().min(0).default(0),
  installFee: z.coerce.number().min(0).default(0),
  notes: z.string().max(5000).optional().nullable(),
  terms: z.string().max(10000).optional().nullable(),
  internalNotes: z.string().max(10000).optional().nullable(),
  lines: z.array(lineSchema).min(1, "Add at least one line before saving.").max(100),
});
export type QuoteLineInput = z.input<typeof lineSchema>;
export type QuoteInput = z.input<typeof quoteSchema>;

const EDITABLE: QuoteStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED"];

export async function saveQuote(input: QuoteInput & { id?: string }): Promise<Result<{ id: string; number: string }>> {
  try {
    const user = await actionStaff();
    const d = quoteSchema.parse(input);
    const totals = computeQuoteTotals({ lines: d.lines, deliveryFee: d.deliveryFee, installFee: d.installFee, taxRate: d.taxRate });
    const lineRows = d.lines.map((l, i) => ({ productId: l.productId, description: l.description.trim(), quantity: l.quantity, unitPrice: l.unitPrice, pricingMode: l.pricingMode as PricingMode, discountPct: l.discountPct, total: totals.lineTotals[i].total, sortOrder: i }));
    const base = {
      title: d.title.trim(),
      companyId: d.companyId,
      contactId: d.contactId,
      dealId: d.dealId,
      validUntil: d.validUntil ? new Date(d.validUntil) : null,
      taxRate: d.taxRate,
      deliveryFee: totals.deliveryFee,
      installFee: totals.installFee,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxAmount: totals.taxAmount,
      monthlyTotal: totals.monthlyTotal,
      oneTimeTotal: totals.oneTimeTotal,
      total: totals.total,
      notes: d.notes?.trim() || null,
      terms: d.terms?.trim() || null,
      internalNotes: d.internalNotes?.trim() || null,
    };

    if (input.id) {
      const existing = await prisma.quote.findUnique({ where: { id: input.id }, include: { lines: true } });
      if (!existing) return { ok: false, error: "Quote not found." };
      if (!EDITABLE.includes(existing.status)) return { ok: false, error: "Only drafts can be edited. Use Revise to start a new version of this quote." };
      const withdrawn = existing.status === "PENDING_APPROVAL";
      await prisma.$transaction(async (tx) => {
        await tx.quote.update({ where: { id: existing.id }, data: { ...base, ownerId: d.ownerId ?? existing.ownerId, status: "DRAFT", approvedById: null, approvedAt: null } });
        await tx.quoteLine.deleteMany({ where: { quoteId: existing.id } });
        await tx.quoteLine.createMany({ data: lineRows.map((l) => ({ ...l, quoteId: existing.id })) });
        if (withdrawn) await tx.approval.updateMany({ where: { entityType: "Quote", entityId: existing.id, status: "PENDING" }, data: { status: "WITHDRAWN", decidedAt: new Date(), decisionNote: "Quote was edited after the request." } });
      });
      await audit({ actorId: user.id, action: "update", entityType: "Quote", entityId: existing.id, before: { total: Number(existing.total), status: existing.status, lines: existing.lines.length }, after: { total: totals.total, status: "DRAFT", lines: lineRows.length } });
      revalidatePath("/hq/quotes");
      revalidatePath(`/hq/quotes/${existing.id}`);
      return { ok: true, data: { id: existing.id, number: existing.number } };
    }

    const settings = await getSetting("quotes");
    const number = await nextNumber("quotes");
    const row = await prisma.quote.create({
      data: {
        ...base,
        number,
        ownerId: d.ownerId ?? user.id,
        validUntil: base.validUntil ?? new Date(Date.now() + settings.validityDays * 86400000),
        terms: base.terms ?? settings.defaultTerms,
        status: "DRAFT",
        lines: { create: lineRows },
      },
    });
    await logActivity({ type: "SYSTEM", subject: `Quote ${number} created: ${row.title}`, quoteId: row.id, companyId: d.companyId, contactId: d.contactId, dealId: d.dealId, actorId: user.id, source: "system" });
    revalidatePath("/hq/quotes");
    return { ok: true, data: { id: row.id, number } };
  } catch (e) {
    return fail(e);
  }
}

export async function submitForApproval(id: string, reason?: string): Promise<Result> {
  try {
    const user = await actionStaff();
    const q = await prisma.quote.findUnique({ where: { id }, include: { lines: true, company: { select: { name: true } } } });
    if (!q) return { ok: false, error: "Quote not found." };
    if (q.status !== "DRAFT") return { ok: false, error: "Only a draft can be sent for approval." };
    if (!hasDiscount(q)) return { ok: false, error: "There is no discount on this quote, so it does not need approval. You can send it." };
    const pending = await prisma.approval.findFirst({ where: { entityType: "Quote", entityId: id, status: "PENDING" } });
    if (pending) return { ok: false, error: "This quote is already waiting for a decision." };
    await prisma.approval.create({
      data: {
        type: "QUOTE_DISCOUNT",
        subject: `Discount on ${q.number}: ${q.title}`,
        reason: reason?.trim() || null,
        entityType: "Quote",
        entityId: id,
        requestedById: user.id,
        requiredTier: "OWNER",
        details: { quoteId: id, number: q.number, title: q.title, company: q.company?.name ?? null, discountTotal: Number(q.discountTotal), maxDiscountPct: maxDiscountPct(q), total: Number(q.total), monthlyTotal: Number(q.monthlyTotal) },
      },
    });
    await prisma.quote.update({ where: { id }, data: { status: "PENDING_APPROVAL" } });
    await logActivity({ type: "SYSTEM", subject: `Discount approval requested on ${q.number}`, body: reason?.trim() || undefined, quoteId: id, companyId: q.companyId, contactId: q.contactId, dealId: q.dealId, actorId: user.id, source: "system" });
    await notifyTier({ minTier: "OWNER", type: "approval", title: `Discount to approve: ${q.number}`, body: `${user.name} asked to send ${q.title} with up to ${maxDiscountPct(q)}% off (${usd(Number(q.discountTotal))}).`, link: "/hq/approvals", exceptUserId: user.id });
    revalidatePath(`/hq/quotes/${id}`);
    revalidatePath("/hq/approvals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approveQuote(id: string, note?: string): Promise<Result> {
  return decide(id, "APPROVED", note);
}

export async function rejectQuote(id: string, note?: string): Promise<Result> {
  return decide(id, "REJECTED", note);
}

async function decide(id: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<Result> {
  try {
    const user = await actionStaff();
    if (!can(user, "quotes.discount")) throw new AccessDenied("Only an owner can decide on discounts.");
    const q = await prisma.quote.findUnique({ where: { id }, select: { status: true } });
    if (!q) return { ok: false, error: "Quote not found." };
    if (q.status !== "PENDING_APPROVAL") return { ok: false, error: "This quote is not waiting for approval." };
    await decideQuoteDiscount({ quoteId: id, decision, deciderId: user.id, note: note?.trim() || null });
    revalidatePath(`/hq/quotes/${id}`);
    revalidatePath("/hq/approvals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function sendQuote(id: string, opts: { message?: string } = {}): Promise<Result<{ token: string; delivered: boolean; to: string }>> {
  try {
    const user = await actionStaff();
    const q = await prisma.quote.findUnique({ where: { id }, include: { lines: true, contact: true, company: { select: { id: true, name: true } }, deal: { select: { id: true, stageKey: true } }, owner: { select: { id: true, name: true, email: true, title: true, signatureHtml: true } } } });
    if (!q) return { ok: false, error: "Quote not found." };
    const resend = q.status === "SENT" || q.status === "VIEWED";
    if (!resend && q.status !== "DRAFT" && q.status !== "APPROVED") return { ok: false, error: `A ${q.status.toLowerCase().replace("_", " ")} quote cannot be sent. Revise it to start a new version.` };
    if (q.lines.length === 0) return { ok: false, error: "Add at least one line before sending." };
    if (!q.contact?.email) return { ok: false, error: "Pick a contact with an email address so we know who to send this to." };
    const discounted = hasDiscount(q);
    if (!resend && discounted && q.status !== "APPROVED" && !can(user, "quotes.discount")) return { ok: false, error: "This quote includes a discount. Ask an owner to approve it before sending." };
    if (q.validUntil && q.validUntil.getTime() < Date.now()) return { ok: false, error: "The valid until date has passed. Edit the quote and set a new date first." };

    const token = q.publicToken ?? randomToken(24);
    const now = new Date();
    await prisma.quote.update({
      where: { id },
      data: resend
        ? { publicToken: token }
        : { status: "SENT", sentAt: now, publicToken: token, ...(discounted && !q.approvedById ? { approvedById: user.id, approvedAt: now } : {}) },
    });

    const link = appUrl(`/q/${token}`);
    const first = q.contact.firstName;
    const sig = q.owner?.signatureHtml?.trim() || `<p style="margin-top:16px">${q.owner?.name ?? user.name}${q.owner?.title ? `<br/>${q.owner.title}` : ""}<br/>Spectrum Robotics</p>`;
    const intro = opts.message?.trim() ? `<p>${escapeHtml(opts.message.trim()).replace(/\n/g, "<br/>")}</p>` : `<p>Thank you for your time. Your quote for ${escapeHtml(q.title)} is ready to review online. You can accept it there or reply to this email with any questions.</p>`;
    const summary = `<table style="border-collapse:collapse;margin:8px 0 4px"><tr><td style="padding:2px 16px 2px 0;color:#666">Quote</td><td style="padding:2px 0"><strong>${q.number}</strong></td></tr><tr><td style="padding:2px 16px 2px 0;color:#666">One time total</td><td style="padding:2px 0"><strong>${usd(Number(q.total))}</strong></td></tr>${Number(q.monthlyTotal) ? `<tr><td style="padding:2px 16px 2px 0;color:#666">Monthly service</td><td style="padding:2px 0"><strong>${usd(Number(q.monthlyTotal))} per month</strong></td></tr>` : ""}${q.validUntil ? `<tr><td style="padding:2px 16px 2px 0;color:#666">Valid until</td><td style="padding:2px 0">${q.validUntil.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</td></tr>` : ""}</table>`;
    const mail = await sendSystemMail({
      to: q.contact.email,
      subject: `${resend ? "Reminder: " : ""}Quote ${q.number} from Spectrum Robotics: ${q.title}`,
      html: `<p>Hi ${escapeHtml(first)},</p>${intro}${summary}${button(link, "View and accept your quote")}${sig}`,
      text: `Hi ${first},\n\nYour quote ${q.number} (${q.title}) is ready: ${link}\n\n${q.owner?.name ?? user.name}\nSpectrum Robotics`,
    });

    await logActivity({ type: "QUOTE_SENT", subject: `${resend ? "Quote resent" : "Quote sent"}: ${q.number} to ${q.contact.email}`, body: opts.message?.trim() || undefined, quoteId: id, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId, actorId: user.id, source: "system", direction: "OUTBOUND", participants: [q.contact.email] });
    if (!resend) {
      if (q.dealId) await systemMoveDealStage(q.dealId, "quote_sent", user.id, { onlyIfBefore: true });
      const ownerId = q.ownerId ?? user.id;
      await prisma.task.create({ data: { title: `Follow up on quote ${q.number} with ${fullName(q.contact)}`, taskType: "follow_up", priority: "MEDIUM", assigneeId: ownerId, createdById: user.id, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId, dueAt: new Date(Date.now() + 3 * 86400000), source: "automation" } });
      await audit({ actorId: user.id, action: "send", entityType: "Quote", entityId: id, after: { to: q.contact.email, total: Number(q.total), discounted } });
    }
    revalidatePath("/hq/quotes");
    revalidatePath(`/hq/quotes/${id}`);
    if (q.dealId) revalidatePath(`/hq/deals/${q.dealId}`);
    return { ok: true, data: { token, delivered: mail.delivered, to: q.contact.email } };
  } catch (e) {
    return fail(e);
  }
}

// Public: called from /q/<token> on first load. Only a SENT quote flips to VIEWED.
export async function markViewed(token: string): Promise<Result> {
  try {
    if (!token || !allowRequest(`q:${token}`)) return { ok: false, error: "Too many requests." };
    const q = await prisma.quote.findUnique({ where: { publicToken: token }, include: { contact: { select: { firstName: true, lastName: true } } } });
    if (!q) return { ok: false, error: "Not found." };
    if (q.status !== "SENT") return { ok: true };
    await prisma.quote.update({ where: { id: q.id }, data: { status: "VIEWED", viewedAt: new Date() } });
    await logActivity({ type: "QUOTE_VIEWED", subject: `Quote ${q.number} opened`, quoteId: q.id, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId, actorLabel: q.contact ? fullName(q.contact) : "Client", source: "system", direction: "INBOUND" });
    if (q.ownerId) await notify({ userId: q.ownerId, type: "deal", title: `Quote ${q.number} was opened`, body: q.contact ? `${fullName(q.contact)} just viewed ${q.title}` : q.title, link: `/hq/quotes/${q.id}` });
    revalidatePath(`/hq/quotes/${q.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const acceptSchema = z.object({ name: z.string().trim().min(2, "Type your full name.").max(120), agreed: z.literal(true, { message: "Please confirm you agree to the terms." }) });

export async function acceptQuote(token: string, acceptedByName: string, agreed: boolean): Promise<Result> {
  try {
    if (!token || !allowRequest(`q:${token}`)) return { ok: false, error: "Too many requests. Please wait a minute and try again." };
    const d = acceptSchema.parse({ name: acceptedByName, agreed });
    const q = await prisma.quote.findUnique({ where: { publicToken: token }, include: { contact: { select: { firstName: true, lastName: true, email: true } }, company: { select: { name: true } } } });
    if (!q) return { ok: false, error: "This quote link is not valid." };
    if (q.status === "ACCEPTED") return { ok: true };
    if (q.status !== "SENT" && q.status !== "VIEWED") return { ok: false, error: "This quote can no longer be accepted. Contact your Spectrum Robotics rep for a fresh one." };
    if (q.validUntil && q.validUntil.getTime() < Date.now()) {
      await prisma.quote.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
      return { ok: false, error: "This quote has expired. Your rep can send an updated version." };
    }
    const h = await headers();
    const ip = clientIp(h);
    const now = new Date();
    await prisma.quote.update({ where: { id: q.id }, data: { status: "ACCEPTED", respondedAt: now, acceptedByName: d.name, acceptedIp: ip, viewedAt: q.viewedAt ?? now } });
    await logActivity({ type: "QUOTE_ACCEPTED", subject: `Quote ${q.number} accepted by ${d.name}`, body: `${usd(Number(q.total))}${Number(q.monthlyTotal) ? ` + ${usd(Number(q.monthlyTotal))}/mo` : ""}${ip ? ` · from ${ip}` : ""}`, quoteId: q.id, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId, actorLabel: d.name, source: "system", direction: "INBOUND", metadata: { ip } });
    if (q.dealId) await systemMoveDealStage(q.dealId, "won", q.ownerId, { actorLabel: d.name });
    const ownerId = q.ownerId;
    if (ownerId) {
      await notify({ userId: ownerId, type: "deal", title: `Quote accepted: ${q.number}`, body: `${d.name}${q.company ? ` at ${q.company.name}` : ""} accepted ${q.title}. Invoice it next.`, link: `/hq/quotes/${q.id}` });
      await prisma.task.create({ data: { title: `Invoice the accepted quote ${q.number}`, taskType: "quote", priority: "HIGH", assigneeId: ownerId, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId, dueAt: new Date(Date.now() + 86400000), source: "automation", description: `Open the quote and click Create invoice. Accepted by ${d.name}.` } });
    }
    await notifyTier({ minTier: "LEADERSHIP", type: "deal", title: `Quote accepted: ${q.number}`, body: `${q.company?.name ?? d.name} · ${usd(Number(q.total))}`, link: `/hq/quotes/${q.id}`, exceptUserId: ownerId ?? undefined });
    await audit({ actorEmail: q.contact?.email ?? null, action: "accept", entityType: "Quote", entityId: q.id, after: { acceptedByName: d.name, ip } });
    revalidatePath(`/hq/quotes/${q.id}`);
    revalidatePath("/hq/quotes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function declineQuote(token: string, reason: string): Promise<Result> {
  try {
    if (!token || !allowRequest(`q:${token}`)) return { ok: false, error: "Too many requests. Please wait a minute and try again." };
    const text = (reason ?? "").trim().slice(0, 2000);
    const q = await prisma.quote.findUnique({ where: { publicToken: token }, include: { contact: { select: { firstName: true, lastName: true, email: true } }, company: { select: { name: true } } } });
    if (!q) return { ok: false, error: "This quote link is not valid." };
    if (q.status === "DECLINED") return { ok: true };
    if (q.status !== "SENT" && q.status !== "VIEWED") return { ok: false, error: "This quote is no longer open." };
    const who = q.contact ? fullName(q.contact) : "Client";
    await prisma.quote.update({ where: { id: q.id }, data: { status: "DECLINED", respondedAt: new Date(), declineReason: text || null, viewedAt: q.viewedAt ?? new Date() } });
    await logActivity({ type: "QUOTE_DECLINED", subject: `Quote ${q.number} declined`, body: text || undefined, quoteId: q.id, contactId: q.contactId, companyId: q.companyId, dealId: q.dealId, actorLabel: who, source: "system", direction: "INBOUND" });
    if (q.dealId) await systemMoveDealStage(q.dealId, "negotiation", q.ownerId, { onlyFrom: ["quote_sent"], actorLabel: who });
    if (q.ownerId) await notify({ userId: q.ownerId, type: "deal", title: `Quote declined: ${q.number}`, body: text ? `${who}: ${text.slice(0, 140)}` : `${who} declined ${q.title}.`, link: `/hq/quotes/${q.id}` });
    revalidatePath(`/hq/quotes/${q.id}`);
    revalidatePath("/hq/quotes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reviseQuote(id: string): Promise<Result<{ id: string; number: string }>> {
  try {
    const user = await actionStaff();
    const q = await prisma.quote.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    if (!q) return { ok: false, error: "Quote not found." };
    if (q.status === "SUPERSEDED") return { ok: false, error: "This quote already has a newer version." };
    if (q.status === "DRAFT") return { ok: false, error: "This is still a draft. Edit it directly." };
    const settings = await getSetting("quotes");
    const base = q.number.replace(/-v\d+$/, "");
    const version = q.version + 1;
    const number = `${base}-v${version}`;
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          number,
          version,
          supersedesId: q.id,
          title: q.title,
          companyId: q.companyId,
          contactId: q.contactId,
          dealId: q.dealId,
          ownerId: q.ownerId ?? user.id,
          status: "DRAFT",
          validUntil: new Date(Date.now() + settings.validityDays * 86400000),
          subtotal: q.subtotal,
          discountTotal: q.discountTotal,
          deliveryFee: q.deliveryFee,
          installFee: q.installFee,
          taxRate: q.taxRate,
          taxAmount: q.taxAmount,
          monthlyTotal: q.monthlyTotal,
          oneTimeTotal: q.oneTimeTotal,
          total: q.total,
          notes: q.notes,
          terms: q.terms,
          internalNotes: q.internalNotes,
          lines: { create: q.lines.map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, pricingMode: l.pricingMode, discountPct: l.discountPct, total: l.total, sortOrder: l.sortOrder })) },
        },
      });
      await tx.quote.update({ where: { id: q.id }, data: { status: "SUPERSEDED" } });
      return created;
    });
    await logActivity({ type: "SYSTEM", subject: `Quote ${number} started as version ${version} of ${q.number}`, quoteId: row.id, companyId: q.companyId, contactId: q.contactId, dealId: q.dealId, actorId: user.id, source: "system" });
    await audit({ actorId: user.id, action: "revise", entityType: "Quote", entityId: q.id, after: { newQuoteId: row.id, number } });
    revalidatePath("/hq/quotes");
    revalidatePath(`/hq/quotes/${id}`);
    return { ok: true, data: { id: row.id, number } };
  } catch (e) {
    return fail(e);
  }
}

export async function expireQuotes(): Promise<Result<{ count: number }>> {
  try {
    await actionStaff();
    const count = await expireQuotesCore();
    return { ok: true, data: { count } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteQuote(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const q = await prisma.quote.findUnique({ where: { id }, select: { status: true, number: true, title: true } });
    if (!q) return { ok: true };
    if (q.status !== "DRAFT") return { ok: false, error: "Only drafts can be deleted. Sent quotes stay on the record." };
    await prisma.quote.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Quote", entityId: id, before: q });
    revalidatePath("/hq/quotes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
