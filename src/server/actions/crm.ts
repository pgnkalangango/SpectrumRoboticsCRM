"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { runEventAutomations } from "@/lib/automations/engine";
import { audit, logActivity, notify, notifyTier } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import type { ActivityType, ContactType, CompanyStatus, DealType, Direction } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));

// ───────────────────────────── Contacts ─────────────────────────────

const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required.").max(80),
  lastName: opt(80),
  email: z.string().email("Enter a valid email.").optional().nullable().or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  emailSecondary: opt(),
  phoneMobile: opt(40),
  phoneOffice: opt(40),
  companyId: opt(),
  companyName: opt(160),
  jobTitle: opt(120),
  type: z.enum(["LEAD", "PROSPECT", "CLIENT", "PARTNER", "VENDOR", "OTHER"]).default("LEAD"),
  leadSource: opt(40),
  ownerId: opt(),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  tags: z.array(z.string()).optional(),
  linkedinUrl: opt(300),
  addressStreet: opt(),
  addressCity: opt(80),
  addressState: opt(40),
  addressZip: opt(20),
  timezone: opt(60),
  notes: z.string().max(10000).optional().nullable(),
  doNotContact: z.boolean().optional(),
});
export type ContactInput = z.input<typeof contactSchema>;

export async function saveContact(input: ContactInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = contactSchema.parse(input);
    if (d.email) {
      const dup = await prisma.contact.findFirst({ where: { email: d.email, ...(input.id ? { id: { not: input.id } } : {}) } });
      if (dup) return { ok: false, error: `There is already a contact with ${d.email}.` };
    }
    let companyName = d.companyName;
    if (d.companyId) {
      const co = await prisma.company.findUnique({ where: { id: d.companyId }, select: { name: true } });
      companyName = co?.name ?? companyName;
    }
    const data = { ...d, companyName, type: d.type as ContactType, ownerId: d.ownerId ?? (input.id ? undefined : user.id), tags: d.tags ?? [], doNotContact: d.doNotContact ?? false, unsubscribedAt: d.doNotContact ? new Date() : null };
    let id = input.id;
    if (id) {
      const before = await prisma.contact.findUnique({ where: { id } });
      await prisma.contact.update({ where: { id }, data });
      await audit({ actorId: user.id, action: "update", entityType: "Contact", entityId: id, before: { type: before?.type, ownerId: before?.ownerId, doNotContact: before?.doNotContact }, after: { type: data.type, ownerId: data.ownerId, doNotContact: data.doNotContact } });
    } else {
      const row = await prisma.contact.create({ data: { ...data, ownerId: data.ownerId ?? user.id } });
      id = row.id;
      await logActivity({ type: "SYSTEM", subject: "Contact created", contactId: id, companyId: d.companyId, actorId: user.id, source: "system" });
    }
    revalidatePath("/hq/contacts");
    revalidatePath(`/hq/contacts/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContact(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const c = await prisma.contact.findUnique({ where: { id } });
    await prisma.contact.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Contact", entityId: id, before: c });
    revalidatePath("/hq/contacts");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Companies ─────────────────────────────

const companySchema = z.object({
  name: z.string().min(1, "Company name is required.").max(160),
  domain: opt(120).transform((v) => (v ? v.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null)),
  industry: opt(60),
  website: opt(300),
  phone: opt(40),
  addressStreet: opt(),
  addressCity: opt(80),
  addressState: opt(40),
  addressZip: opt(20),
  employeeCount: z.coerce.number().int().min(0).optional().nullable(),
  annualRevenue: z.coerce.number().min(0).optional().nullable(),
  status: z.enum(["PROSPECT", "ACTIVE", "PARTNER", "COMPETITOR", "INACTIVE"]).default("PROSPECT"),
  ownerId: opt(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(10000).optional().nullable(),
  source: opt(60),
  portalEnabled: z.boolean().optional(),
  clientCode: opt(40).transform((v) => (v ? v.toUpperCase() : null)),
});
export type CompanyInput = z.input<typeof companySchema>;

export async function saveCompany(input: CompanyInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = companySchema.parse(input);
    if (d.clientCode) {
      const dup = await prisma.company.findFirst({ where: { clientCode: d.clientCode, ...(input.id ? { id: { not: input.id } } : {}) } });
      if (dup) return { ok: false, error: `Client code ${d.clientCode} is already used by ${dup.name}.` };
    }
    const data = { ...d, status: d.status as CompanyStatus, tags: d.tags ?? [], portalEnabled: d.portalEnabled ?? false, ownerId: d.ownerId ?? (input.id ? undefined : user.id) };
    let id = input.id;
    if (id) {
      await prisma.company.update({ where: { id }, data });
      await prisma.contact.updateMany({ where: { companyId: id }, data: { companyName: d.name } });
    } else {
      const row = await prisma.company.create({ data: { ...data, ownerId: data.ownerId ?? user.id } });
      id = row.id;
      await logActivity({ type: "SYSTEM", subject: "Company created", companyId: id, actorId: user.id, source: "system" });
    }
    revalidatePath("/hq/companies");
    revalidatePath(`/hq/companies/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCompany(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const counts = await prisma.company.findUnique({ where: { id }, select: { _count: { select: { contacts: true, deals: true, quotes: true, invoices: true, sites: true } } } });
    const total = counts ? Object.values(counts._count).reduce((a, b) => a + b, 0) : 0;
    if (total > 0) return { ok: false, error: "This company still has contacts, deals, quotes, invoices or sites. Move or delete those first, or set the company to Inactive." };
    await prisma.company.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Company", entityId: id });
    revalidatePath("/hq/companies");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Deals ─────────────────────────────

const dealSchema = z.object({
  name: z.string().min(1, "Give the deal a name.").max(200),
  companyId: opt(),
  primaryContactId: opt(),
  value: z.coerce.number().min(0).default(0),
  monthlyValue: z.coerce.number().min(0).default(0),
  stageKey: z.string().min(1),
  probability: z.coerce.number().int().min(0).max(100).optional().nullable(),
  expectedCloseDate: opt(20),
  ownerId: opt(),
  channel: opt(40),
  dealType: z.enum(["NEW_BUSINESS", "UPSELL", "RENEWAL", "PARTNERSHIP"]).default("NEW_BUSINESS"),
  nextStep: opt(300),
  nextStepDueAt: opt(30),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(10000).optional().nullable(),
  campaignId: opt(),
});
export type DealInput = z.input<typeof dealSchema>;

export async function saveDeal(input: DealInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = dealSchema.parse(input);
    const stage = await prisma.pipelineStage.findUnique({ where: { key: d.stageKey } });
    if (!stage) return { ok: false, error: "Pick a pipeline stage." };
    const data = {
      name: d.name,
      companyId: d.companyId,
      primaryContactId: d.primaryContactId,
      value: d.value,
      monthlyValue: d.monthlyValue,
      stageKey: d.stageKey,
      probability: d.probability ?? stage.probability,
      expectedCloseDate: d.expectedCloseDate ? new Date(d.expectedCloseDate) : null,
      ownerId: d.ownerId ?? (input.id ? undefined : user.id),
      channel: d.channel,
      dealType: d.dealType as DealType,
      nextStep: d.nextStep,
      nextStepDueAt: d.nextStepDueAt ? new Date(d.nextStepDueAt) : null,
      tags: d.tags ?? [],
      notes: d.notes ?? null,
      campaignId: d.campaignId,
    };
    let id = input.id;
    if (id) {
      const before = await prisma.deal.findUnique({ where: { id }, include: { stage: true } });
      await prisma.deal.update({ where: { id }, data });
      if (before && before.stageKey !== d.stageKey) await afterStageChange(id, before.stageKey, d.stageKey, user.id);
      if (d.primaryContactId) await prisma.dealContact.upsert({ where: { dealId_contactId: { dealId: id, contactId: d.primaryContactId } }, create: { dealId: id, contactId: d.primaryContactId, role: "primary" }, update: {} });
    } else {
      const row = await prisma.deal.create({ data: { ...data, ownerId: data.ownerId ?? user.id, lastActivityAt: new Date() } });
      id = row.id;
      if (d.primaryContactId) await prisma.dealContact.create({ data: { dealId: id, contactId: d.primaryContactId, role: "primary" } });
      await logActivity({ type: "SYSTEM", subject: `Deal created in ${stage.label}`, dealId: id, companyId: d.companyId, contactId: d.primaryContactId, actorId: user.id, source: "system" });
    }
    revalidatePath("/hq/deals");
    revalidatePath(`/hq/deals/${id}`);
    revalidatePath("/hq");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function moveDealStage(id: string, stageKey: string, opts: { lostReason?: string } = {}): Promise<Result> {
  try {
    const user = await actionStaff();
    const [deal, stage] = await Promise.all([prisma.deal.findUnique({ where: { id }, include: { stage: true } }), prisma.pipelineStage.findUnique({ where: { key: stageKey } })]);
    if (!deal || !stage) return { ok: false, error: "Deal or stage not found." };
    if (stage.isLost && !opts.lostReason) return { ok: false, error: "Add the reason the deal was lost." };
    await prisma.deal.update({
      where: { id },
      data: { stageKey, probability: stage.probability, lostReason: stage.isLost ? opts.lostReason : null, wonAt: stage.isWon ? new Date() : null, lostAt: stage.isLost ? new Date() : null, lastActivityAt: new Date() },
    });
    await afterStageChange(id, deal.stageKey, stageKey, user.id, opts.lostReason);
    revalidatePath("/hq/deals");
    revalidatePath(`/hq/deals/${id}`);
    revalidatePath("/hq");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function afterStageChange(dealId: string, from: string, to: string, actorId: string, lostReason?: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { stage: true, company: { select: { name: true } } } });
  if (!deal) return;
  await logActivity({ type: "STAGE_CHANGE", subject: `${from.replace(/_/g, " ")} → ${deal.stage.label}${lostReason ? ` (${lostReason})` : ""}`, dealId, companyId: deal.companyId, contactId: deal.primaryContactId, actorId, source: "system", metadata: { from, to } });
  if (deal.stage.isWon) {
    const setupSop = await prisma.sop.findUnique({ where: { slug: "admin-new-customer-setup" }, select: { id: true } });
    await prisma.task.create({ data: { title: `Set up the new customer: ${deal.company?.name ?? deal.name}`, taskType: "onboarding", priority: "HIGH", assigneeId: deal.ownerId ?? actorId, createdById: actorId, dealId, companyId: deal.companyId, sopId: setupSop?.id, dueAt: new Date(Date.now() + 2 * 86400000), source: "automation" } });
    await prisma.project.create({ data: { name: `Install: ${deal.company?.name ?? deal.name}`, type: "install", status: "PLANNING", ownerId: deal.ownerId ?? actorId, companyId: deal.companyId, dealId, stages: INSTALL_STAGES } });
    if (deal.companyId) await prisma.company.update({ where: { id: deal.companyId }, data: { status: "ACTIVE" } });
    await notifyTier({ minTier: "LEADERSHIP", type: "deal", title: `Deal won: ${deal.name}`, body: `${deal.company?.name ?? ""} · setup task and install project created`, link: `/hq/deals/${dealId}`, exceptUserId: actorId });
  }
  // Company automations (Settings > Automations) run after the built in rules above.
  await runEventAutomations("deal.stage_changed", { dealId, from, to });
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

export async function setDealNextStep(id: string, nextStep: string, dueAt?: string | null): Promise<Result> {
  try {
    await actionStaff();
    await prisma.deal.update({ where: { id }, data: { nextStep: nextStep || null, nextStepDueAt: dueAt ? new Date(dueAt) : null } });
    revalidatePath(`/hq/deals/${id}`);
    revalidatePath("/hq/deals");
    revalidatePath("/hq");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDeal(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    await prisma.deal.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Deal", entityId: id });
    revalidatePath("/hq/deals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Timeline entries ─────────────────────────────

const activitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "MEETING", "EMAIL_OUT", "EMAIL_IN", "SMS", "LINKEDIN"]).default("NOTE"),
  subject: z.string().max(200).optional().nullable(),
  body: z.string().min(1, "Write something first.").max(20000),
  contactId: opt(),
  companyId: opt(),
  dealId: opt(),
  quoteId: opt(),
  ticketId: opt(),
  siteId: opt(),
  occurredAt: opt(40),
  direction: z.enum(["INBOUND", "OUTBOUND", "INTERNAL"]).optional(),
});
export type ActivityInput = z.input<typeof activitySchema>;

export async function addActivity(input: ActivityInput): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = activitySchema.parse(input);
    const row = await logActivity({
      type: d.type as ActivityType,
      subject: d.subject ?? undefined,
      body: d.body,
      contactId: d.contactId,
      companyId: d.companyId,
      dealId: d.dealId,
      quoteId: d.quoteId,
      ticketId: d.ticketId,
      siteId: d.siteId,
      actorId: user.id,
      occurredAt: d.occurredAt ? new Date(d.occurredAt) : new Date(),
      direction: (d.direction ?? (d.type === "EMAIL_IN" ? "INBOUND" : d.type === "NOTE" ? "INTERNAL" : "OUTBOUND")) as Direction,
    });
    if (!row) return { ok: false, error: "Could not save." };
    for (const p of ["/hq", "/hq/contacts", "/hq/companies", "/hq/deals"]) revalidatePath(p, "layout");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteActivity(id: string): Promise<Result> {
  try {
    const user = await actionStaff();
    const a = await prisma.activity.findUnique({ where: { id } });
    if (!a) return { ok: true };
    if (a.actorId !== user.id && user.tier === "EMPLOYEE") return { ok: false, error: "You can only delete your own entries." };
    await prisma.activity.delete({ where: { id } });
    for (const p of ["/hq/contacts", "/hq/companies", "/hq/deals"]) revalidatePath(p, "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function convertLeadToDeal(contactId: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const c = await prisma.contact.findUnique({ where: { id: contactId }, include: { company: true } });
    if (!c) return { ok: false, error: "Contact not found." };
    const leads = await getSetting("leads");
    const owner = c.ownerId ?? user.id;
    const deal = await prisma.deal.create({ data: { name: `${c.company?.name ?? c.companyName ?? `${c.firstName} ${c.lastName ?? ""}`.trim()} opportunity`, companyId: c.companyId, primaryContactId: c.id, stageKey: "new", ownerId: leads.autoDeal ? owner : owner, channel: c.leadSource ?? undefined, lastActivityAt: new Date(), nextStep: "Book the free 20 minute assessment call", nextStepDueAt: new Date(Date.now() + 3 * 86400000) } });
    await prisma.dealContact.create({ data: { dealId: deal.id, contactId: c.id, role: "primary" } });
    if (c.type === "LEAD") await prisma.contact.update({ where: { id: c.id }, data: { type: "PROSPECT" } });
    await logActivity({ type: "SYSTEM", subject: "Deal created from contact", dealId: deal.id, contactId: c.id, companyId: c.companyId, actorId: user.id, source: "system" });
    await notify({ userId: owner, type: "deal", title: "New deal created", body: deal.name, link: `/hq/deals/${deal.id}` });
    revalidatePath("/hq/deals");
    return { ok: true, data: { id: deal.id } };
  } catch (e) {
    return fail(e);
  }
}
