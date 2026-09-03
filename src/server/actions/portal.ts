"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { actionUser, AccessDenied } from "@/lib/session";
import { portalScope } from "@/lib/portal";
import { runEventAutomations } from "@/lib/automations/engine";
import { audit, logActivity, notify, notifyTier } from "@/lib/audit";
import { nextNumber } from "@/lib/settings";
import { slaDueFor } from "@/lib/service";
import type { SessionUser } from "@/lib/permissions";
import type { TicketPriority } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

// Every portal write starts here: who is signed in and which company they may touch.
// Staff previewing a client's portal pass the company id they are previewing; clients never can.
async function clientScope(preview?: string | null): Promise<{ user: SessionUser; companyId: string; contactId: string | null }> {
  const user = await actionUser();
  const scope = await portalScope(user, user.kind === "STAFF" ? preview : null);
  if (!scope.companyId) throw new AccessDenied("Your account is not linked to a company yet. Contact Spectrum Robotics and we will fix that.");
  return { user, companyId: scope.companyId, contactId: scope.contactId };
}

function revalidatePortal() {
  for (const p of ["/portal", "/hq", "/hq/quotes", "/hq/deals", "/hq/service/tickets", "/hq/companies"]) revalidatePath(p, "layout");
}

// ───────────────────────────── Quotes ─────────────────────────────

async function loadQuoteForResponse(quoteId: string, companyId: string) {
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, include: { company: { select: { name: true } }, deal: { include: { stage: true } }, owner: { select: { id: true, name: true } } } });
  if (!q || q.companyId !== companyId) throw new AccessDenied("That quote is not on your account.");
  if (!["SENT", "VIEWED"].includes(q.status)) throw new AccessDenied(q.status === "ACCEPTED" ? "This quote was already accepted." : q.status === "DECLINED" ? "This quote was already declined." : "This quote is no longer open for a response.");
  if (q.validUntil && q.validUntil.getTime() < Date.now() - 86400000) throw new AccessDenied("This quote has expired. Ask your Spectrum contact for a fresh one.");
  return q;
}

export async function portalAcceptQuote(quoteId: string, name: string, preview?: string | null): Promise<Result> {
  try {
    const { user, companyId, contactId } = await clientScope(preview);
    const acceptedByName = name.trim();
    if (acceptedByName.length < 2) return { ok: false, error: "Type your full name to sign." };
    const q = await loadQuoteForResponse(quoteId, companyId);
    const now = new Date();
    await prisma.quote.update({ where: { id: q.id }, data: { status: "ACCEPTED", respondedAt: now, acceptedByName, viewedAt: q.viewedAt ?? now } });
    const activityBase = { contactId: contactId ?? q.contactId, companyId, dealId: q.dealId, quoteId: q.id, actorId: user.kind === "STAFF" ? user.id : null, actorLabel: user.kind === "STAFF" ? `${user.name} (portal preview)` : acceptedByName, source: "portal", direction: "INBOUND" as const };
    await logActivity({ type: "QUOTE_ACCEPTED", subject: `${q.number} accepted by ${acceptedByName}`, body: `Accepted in the client portal for ${q.company?.name ?? "the company"}.`, ...activityBase });
    await audit({ actorId: user.id, actorEmail: user.email, action: "accept", entityType: "Quote", entityId: q.id, before: { status: q.status }, after: { status: "ACCEPTED", acceptedByName } });

    // Same effect as moving the deal to Won in HQ, done here because that action is staff only.
    if (q.deal && !q.deal.stage.isWon) {
      const won = await prisma.pipelineStage.findUnique({ where: { key: "won" } });
      if (won) {
        await prisma.deal.update({ where: { id: q.deal.id }, data: { stageKey: "won", probability: won.probability, wonAt: now, lostAt: null, lostReason: null, lastActivityAt: now } });
        await logActivity({ type: "STAGE_CHANGE", subject: `${q.deal.stageKey.replace(/_/g, " ")} → ${won.label} (quote ${q.number} accepted)`, ...activityBase, quoteId: null, metadata: { from: q.deal.stageKey, to: "won" } });
        const setupSop = await prisma.sop.findUnique({ where: { slug: "admin-new-customer-setup" }, select: { id: true } });
        const ownerId = q.deal.ownerId ?? q.ownerId ?? null;
        await prisma.task.create({ data: { title: `Set up the new customer: ${q.company?.name ?? q.deal.name}`, taskType: "onboarding", priority: "HIGH", assigneeId: ownerId, createdById: user.kind === "STAFF" ? user.id : null, dealId: q.deal.id, companyId, sopId: setupSop?.id, dueAt: new Date(Date.now() + 2 * 86400000), source: "automation" } });
        const existingInstall = await prisma.project.findFirst({ where: { dealId: q.deal.id, type: "install" }, select: { id: true } });
        if (!existingInstall) {
          await prisma.project.create({ data: { name: `Install: ${q.company?.name ?? q.deal.name}`, type: "install", status: "PLANNING", ownerId, companyId, dealId: q.deal.id, stages: INSTALL_STAGES } });
        }
        await prisma.company.update({ where: { id: companyId }, data: { status: "ACTIVE" } });
      }
    }
    const invoiceSop = await prisma.sop.findUnique({ where: { slug: "finance-invoicing-and-collections" }, select: { id: true } });
    await prisma.task.create({ data: { title: `Invoice the accepted quote ${q.number}`, description: `${q.title} for ${q.company?.name ?? "the company"} was accepted by ${acceptedByName}. Create and send the invoice.`, taskType: "quote", priority: "HIGH", assigneeId: q.ownerId, createdById: user.kind === "STAFF" ? user.id : null, dealId: q.dealId, companyId, contactId: q.contactId, sopId: invoiceSop?.id, dueAt: new Date(Date.now() + 86400000), source: "automation" } });
    if (q.ownerId) await notify({ userId: q.ownerId, type: "deal", title: `Quote accepted: ${q.number}`, body: `${q.company?.name ?? ""} · signed by ${acceptedByName}`.trim(), link: `/hq/quotes/${q.id}` });
    await notifyTier({ minTier: "LEADERSHIP", type: "deal", title: `Quote accepted: ${q.number}`, body: `${q.company?.name ?? ""} · ${q.title}`.trim(), link: `/hq/quotes/${q.id}`, exceptUserId: q.ownerId ?? undefined });
    revalidatePortal();
    revalidatePath(`/portal/quotes/${q.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function portalDeclineQuote(quoteId: string, reason: string, preview?: string | null): Promise<Result> {
  try {
    const { user, companyId, contactId } = await clientScope(preview);
    const text = reason.trim();
    if (!text) return { ok: false, error: "Tell us briefly why, so we can do better." };
    const q = await loadQuoteForResponse(quoteId, companyId);
    const now = new Date();
    await prisma.quote.update({ where: { id: q.id }, data: { status: "DECLINED", respondedAt: now, declineReason: text.slice(0, 2000), viewedAt: q.viewedAt ?? now } });
    const who = user.kind === "STAFF" ? `${user.name} (portal preview)` : user.name;
    await logActivity({ type: "QUOTE_DECLINED", subject: `${q.number} declined`, body: text, contactId: contactId ?? q.contactId, companyId, dealId: q.dealId, quoteId: q.id, actorId: user.kind === "STAFF" ? user.id : null, actorLabel: who, source: "portal", direction: "INBOUND" });
    await audit({ actorId: user.id, actorEmail: user.email, action: "decline", entityType: "Quote", entityId: q.id, before: { status: q.status }, after: { status: "DECLINED", reason: text } });
    if (q.ownerId) await notify({ userId: q.ownerId, type: "deal", title: `Quote declined: ${q.number}`, body: text.slice(0, 140), link: `/hq/quotes/${q.id}` });
    await notifyTier({ minTier: "LEADERSHIP", type: "deal", title: `Quote declined: ${q.number}`, body: `${q.company?.name ?? ""} · ${text.slice(0, 120)}`.trim(), link: `/hq/quotes/${q.id}`, exceptUserId: q.ownerId ?? undefined });
    revalidatePortal();
    revalidatePath(`/portal/quotes/${q.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const INSTALL_STAGES = [
  { key: "payment", title: "Payment confirmed", done: false },
  { key: "ordered", title: "Robot ordered from OEM", done: false },
  { key: "trip", title: "Trip planned and approved", done: false },
  { key: "shipped", title: "Shipment tracked to site", done: false },
  { key: "installed", title: "Installed and mapped on site", done: false },
  { key: "trained", title: "Operators trained and certified", done: false },
  { key: "handoff", title: "Support info handed over, project closed", done: false },
];

// ───────────────────────────── Support tickets ─────────────────────────────

const portalTicketSchema = z.object({
  subject: z.string().min(3, "Give us a short summary of the problem.").max(200),
  description: z.string().max(10000).optional().nullable(),
  category: z.string().max(40).default("other"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  siteId: z.string().optional().nullable().transform((v) => (v ? v : null)),
  robotUnitId: z.string().optional().nullable().transform((v) => (v ? v : null)),
});
export type PortalTicketInput = z.input<typeof portalTicketSchema>;

export async function portalCreateTicket(input: PortalTicketInput, preview?: string | null): Promise<Result<{ id: string; number: string }>> {
  try {
    const { user, companyId, contactId } = await clientScope(preview);
    const d = portalTicketSchema.parse(input);
    const [site, robot, company] = await Promise.all([
      d.siteId ? prisma.site.findUnique({ where: { id: d.siteId }, select: { id: true, companyId: true, name: true, technicianId: true, accountManagerId: true } }) : null,
      d.robotUnitId ? prisma.robotUnit.findUnique({ where: { id: d.robotUnitId }, select: { id: true, companyId: true, siteId: true, serialNumber: true, modelName: true } }) : null,
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true, ownerId: true } }),
    ]);
    if (d.siteId && (!site || site.companyId !== companyId)) return { ok: false, error: "Pick one of your own sites." };
    if (d.robotUnitId && (!robot || robot.companyId !== companyId)) return { ok: false, error: "Pick one of your own robots." };
    const siteId = site?.id ?? robot?.siteId ?? null;
    const siteRow = siteId && !site ? await prisma.site.findUnique({ where: { id: siteId }, select: { technicianId: true, accountManagerId: true, name: true } }) : site;
    const assigneeId = siteRow?.technicianId ?? siteRow?.accountManagerId ?? company?.ownerId ?? null;
    const number = await nextNumber("tickets");
    const slaDueAt = await slaDueFor(d.priority as TicketPriority);
    const row = await prisma.ticket.create({
      data: { number, subject: d.subject, description: d.description || null, category: d.category, priority: d.priority as TicketPriority, status: "NEW", companyId, siteId, robotUnitId: robot?.id ?? null, contactId, createdById: user.id, assigneeId, slaDueAt, clientVisible: true },
    });
    await runEventAutomations("ticket.created", { ticketId: row.id });
    const who = user.kind === "STAFF" ? `${user.name} (portal preview)` : user.name;
    await logActivity({ type: "TICKET", subject: `${number} opened from the portal: ${d.subject}`, body: d.description || undefined, ticketId: row.id, companyId, siteId, contactId, actorId: user.kind === "STAFF" ? user.id : null, actorLabel: who, source: "portal", direction: "INBOUND" });
    const link = `/hq/service/tickets/${row.id}`;
    const body = `${company?.name ?? "A client"} · ${d.priority.toLowerCase()} priority${robot ? ` · ${robot.modelName ?? "robot"} ${robot.serialNumber}` : ""}`;
    const notified = new Set<string>();
    for (const uid of [siteRow?.technicianId, siteRow?.accountManagerId].filter((x): x is string => !!x)) {
      if (!notified.has(uid)) {
        notified.add(uid);
        await notify({ userId: uid, type: "ticket", title: `New client ticket ${number}: ${d.subject}`, body, link });
      }
    }
    await notifyTier({ minTier: "LEADERSHIP", type: "ticket", title: `New client ticket ${number}: ${d.subject}`, body, link });
    revalidatePortal();
    return { ok: true, data: { id: row.id, number } };
  } catch (e) {
    return fail(e);
  }
}

export async function portalAddComment(ticketId: string, body: string, preview?: string | null): Promise<Result<{ id: string }>> {
  try {
    const { user, companyId, contactId } = await clientScope(preview);
    const text = body.trim();
    if (!text) return { ok: false, error: "Write your reply first." };
    if (text.length > 10000) return { ok: false, error: "That reply is too long." };
    const t = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, number: true, subject: true, companyId: true, siteId: true, status: true, assigneeId: true, clientVisible: true } });
    if (!t || t.companyId !== companyId || !t.clientVisible) throw new AccessDenied("That ticket is not on your account.");
    const row = await prisma.ticketComment.create({ data: { ticketId, authorId: user.id, body: text, internal: false } });
    const reopen = t.status === "WAITING_CUSTOMER" || t.status === "RESOLVED";
    await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date(), status: reopen ? "IN_PROGRESS" : undefined, resolvedAt: t.status === "RESOLVED" ? null : undefined } });
    const who = user.kind === "STAFF" ? `${user.name} (portal preview)` : user.name;
    await logActivity({ type: "TICKET", subject: `Client reply on ${t.number}`, body: text, ticketId, companyId, siteId: t.siteId, contactId, actorId: user.kind === "STAFF" ? user.id : null, actorLabel: who, source: "portal", direction: "INBOUND" });
    const link = `/hq/service/tickets/${ticketId}`;
    if (t.assigneeId) await notify({ userId: t.assigneeId, type: "ticket", title: `${who} replied on ${t.number}`, body: text.slice(0, 140), link });
    else await notifyTier({ minTier: "LEADERSHIP", type: "ticket", title: `Client reply on unassigned ${t.number}`, body: text.slice(0, 140), link });
    revalidatePortal();
    revalidatePath(`/portal/support/${ticketId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function portalRequestTraining(note: string | null | undefined, preview?: string | null): Promise<Result<{ id: string; number: string }>> {
  const text = (note ?? "").trim();
  return portalCreateTicket({ subject: "Training request", description: text || "A client asked for operator training through the portal.", category: "training", priority: "NORMAL" }, preview);
}

// ───────────────────────────── Profile ─────────────────────────────

const profileSchema = z.object({
  name: z.string().min(2, "Enter your name.").max(120),
  phone: z.string().max(40).optional().nullable().transform((v) => (v ? v : null)),
  timezone: z.string().max(60).default("America/Chicago"),
});
export type ProfileInput = z.input<typeof profileSchema>;

export async function portalUpdateProfile(input: ProfileInput): Promise<Result> {
  try {
    const user = await actionUser();
    const d = profileSchema.parse(input);
    const before = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, phone: true, timezone: true, contactId: true } });
    await prisma.user.update({ where: { id: user.id }, data: { name: d.name, phone: d.phone, timezone: d.timezone } });
    if (before?.contactId && user.kind === "CLIENT") {
      const parts = d.name.split(/\s+/);
      await prisma.contact.update({ where: { id: before.contactId }, data: { firstName: parts[0], lastName: parts.slice(1).join(" ") || null, phoneMobile: d.phone ?? undefined, timezone: d.timezone } }).catch(() => null);
    }
    await audit({ actorId: user.id, actorEmail: user.email, action: "update", entityType: "User", entityId: user.id, before, after: { name: d.name, phone: d.phone, timezone: d.timezone } });
    revalidatePath("/portal", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function portalChangePassword(current: string, next: string): Promise<Result> {
  try {
    const user = await actionUser();
    if (next.length < 10) return { ok: false, error: "Use at least 10 characters for the new password." };
    if (next.length > 200) return { ok: false, error: "That password is too long." };
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!row) return { ok: false, error: "Account not found." };
    if (row.passwordHash) {
      const okCurrent = await compare(current, row.passwordHash);
      if (!okCurrent) return { ok: false, error: "Your current password is not right." };
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(next, 10) } });
    await audit({ actorId: user.id, actorEmail: user.email, action: "password_change", entityType: "User", entityId: user.id });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
