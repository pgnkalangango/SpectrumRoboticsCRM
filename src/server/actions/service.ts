"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, actionStaff, AccessDenied } from "@/lib/session";
import { runEventAutomations } from "@/lib/automations/engine";
import { audit, logActivity, notify, notifyTier } from "@/lib/audit";
import { nextNumber } from "@/lib/settings";
import { certificateExpiry, computeNextMaintenance, defaultMaintenanceInterval, robotLabel, slaDueFor } from "@/lib/service";
import type { Ownership, RobotStatus, SiteStatus, TicketPriority, TicketStatus } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));
const optDate = () => z.string().max(40).optional().nullable().transform((v) => (v ? new Date(v) : null));
const optInt = (min = 0) => z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(min).nullable());

function revalidateService() {
  for (const p of ["/hq", "/hq/service/sites", "/hq/service/robots", "/hq/service/tickets", "/hq/companies", "/portal"]) revalidatePath(p, "layout");
}

// Portal users who should hear about a ticket: the contact's own login first, otherwise everyone at the company.
async function portalUsersForTicket(ticket: { contactId: string | null; companyId: string | null }): Promise<string[]> {
  if (ticket.contactId) {
    const u = await prisma.user.findUnique({ where: { contactId: ticket.contactId }, select: { id: true, status: true } });
    if (u && u.status === "ACTIVE") return [u.id];
  }
  if (!ticket.companyId) return [];
  const users = await prisma.user.findMany({ where: { companyId: ticket.companyId, kind: "CLIENT", status: "ACTIVE" }, select: { id: true } });
  return users.map((u) => u.id);
}

// ───────────────────────────── Sites ─────────────────────────────

const siteSchema = z.object({
  name: z.string().min(1, "Give the site a name.").max(160),
  companyId: z.string().min(1, "Pick the company this site belongs to."),
  addressStreet: opt(),
  addressCity: opt(80),
  addressState: opt(40),
  addressZip: opt(20),
  siteType: z.string().max(40).default("other"),
  sqFootage: optInt(),
  floors: optInt(),
  wifiNotes: z.string().max(5000).optional().nullable(),
  primaryContactId: opt(),
  accountManagerId: opt(),
  technicianId: opt(),
  status: z.enum(["PROSPECT", "SURVEY_SCHEDULED", "SURVEYED", "INSTALL_SCHEDULED", "LIVE", "PAUSED", "CHURNED"]).default("PROSPECT"),
  surveyDate: optDate(),
  goLiveDate: optDate(),
  notes: z.string().max(10000).optional().nullable(),
});
export type SiteInput = z.input<typeof siteSchema>;

export async function saveSite(input: SiteInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = siteSchema.parse(input);
    const data = { ...d, status: d.status as SiteStatus, wifiNotes: d.wifiNotes || null, notes: d.notes || null };
    let id = input.id;
    if (id) {
      const before = await prisma.site.findUnique({ where: { id }, select: { status: true, companyId: true } });
      await prisma.site.update({ where: { id }, data });
      if (before && before.status !== d.status) {
        await logActivity({ type: "SYSTEM", subject: `Site status: ${before.status.replace(/_/g, " ").toLowerCase()} to ${d.status.replace(/_/g, " ").toLowerCase()}`, siteId: id, companyId: d.companyId, actorId: user.id, source: "system" });
        await audit({ actorId: user.id, action: "update", entityType: "Site", entityId: id, before: { status: before.status }, after: { status: d.status } });
      }
    } else {
      const row = await prisma.site.create({ data: { ...data, accountManagerId: data.accountManagerId ?? user.id } });
      id = row.id;
      await logActivity({ type: "SYSTEM", subject: `Site added: ${d.name}`, siteId: id, companyId: d.companyId, actorId: user.id, source: "system" });
    }
    revalidateService();
    revalidatePath(`/hq/service/sites/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSite(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const counts = await prisma.site.findUnique({ where: { id }, select: { _count: { select: { robots: true, tickets: true, certificates: true } } } });
    const total = counts ? Object.values(counts._count).reduce((a, b) => a + b, 0) : 0;
    if (total > 0) return { ok: false, error: "This site still has robots, tickets or certificates. Move those first, or set the site to Churned." };
    await prisma.site.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Site", entityId: id });
    revalidateService();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Install projects ─────────────────────────────

type Stage = { key: string; title: string; done: boolean };

export async function toggleProjectStage(projectId: string, key: string, siteId?: string | null): Promise<Result<{ completed: boolean }>> {
  try {
    const user = await actionStaff();
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { company: { select: { name: true } } } });
    if (!project) return { ok: false, error: "Project not found." };
    const stages = ((project.stages as Stage[] | null) ?? []).map((s) => (s.key === key ? { ...s, done: !s.done } : s));
    const allDone = stages.length > 0 && stages.every((s) => s.done);
    const anyDone = stages.some((s) => s.done);
    const targetSiteId = project.siteId ?? siteId ?? null;
    await prisma.project.update({
      where: { id: projectId },
      data: { stages, status: allDone ? "COMPLETED" : project.status === "COMPLETED" || project.status === "PLANNING" ? (anyDone ? "ACTIVE" : "PLANNING") : project.status, siteId: targetSiteId ?? undefined },
    });
    const toggled = stages.find((s) => s.key === key);
    await logActivity({ type: "SYSTEM", subject: `${toggled?.done ? "Done" : "Reopened"}: ${toggled?.title ?? key}`, siteId: targetSiteId, companyId: project.companyId, dealId: project.dealId, actorId: user.id, source: "system" });
    if (allDone) {
      if (targetSiteId) {
        const site = await prisma.site.findUnique({ where: { id: targetSiteId }, select: { goLiveDate: true, name: true } });
        await prisma.site.update({ where: { id: targetSiteId }, data: { status: "LIVE", goLiveDate: site?.goLiveDate ?? new Date() } });
        await logActivity({ type: "SYSTEM", subject: `Site is live: ${site?.name ?? ""}`.trim(), siteId: targetSiteId, companyId: project.companyId, actorId: user.id, source: "system" });
      }
      await audit({ actorId: user.id, action: "complete", entityType: "Project", entityId: projectId, after: { status: "COMPLETED" } });
      await notifyTier({ minTier: "LEADERSHIP", type: "system", title: `Install complete: ${project.company?.name ?? project.name}`, body: "All install stages are done and the site is live.", link: targetSiteId ? `/hq/service/sites/${targetSiteId}` : `/hq/companies/${project.companyId}`, exceptUserId: user.id });
    }
    revalidateService();
    if (targetSiteId) revalidatePath(`/hq/service/sites/${targetSiteId}`);
    return { ok: true, data: { completed: allDone } };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Training certificates ─────────────────────────────

const certSchema = z.object({
  traineeName: z.string().min(1, "Who was trained?").max(120),
  traineeEmail: z.string().email("Enter a valid email.").optional().nullable().or(z.literal("")).transform((v) => (v ? v.toLowerCase() : null)),
  robotModel: opt(120),
  score: optInt(0),
});
export type CertificateInput = z.input<typeof certSchema>;

export async function issueCertificate(siteId: string, input: CertificateInput): Promise<Result<{ id: string; certificateNumber: string }>> {
  try {
    const user = await actionStaff();
    const d = certSchema.parse(input);
    if (d.score !== null && d.score > 100) return { ok: false, error: "Score is a percentage from 0 to 100." };
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { companyId: true, name: true } });
    if (!site) return { ok: false, error: "Site not found." };
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    let count = await prisma.trainingCertificate.count({ where: { issuedAt: { gte: yearStart } } });
    let certificateNumber = "";
    for (let i = 0; i < 20; i++) {
      count += 1;
      certificateNumber = `SRC-${year}-${String(count).padStart(4, "0")}`;
      const exists = await prisma.trainingCertificate.findUnique({ where: { certificateNumber }, select: { id: true } });
      if (!exists) break;
    }
    const issuedAt = new Date();
    const row = await prisma.trainingCertificate.create({
      data: { certificateNumber, companyId: site.companyId, siteId, traineeName: d.traineeName, traineeEmail: d.traineeEmail, robotModel: d.robotModel, score: d.score, issuedAt, issuedById: user.id, expiresAt: certificateExpiry(issuedAt) },
    });
    await logActivity({ type: "SYSTEM", subject: `Training certificate ${certificateNumber} issued to ${d.traineeName}`, body: d.robotModel ? `${d.robotModel}${d.score !== null ? ` · score ${d.score}%` : ""}` : undefined, siteId, companyId: site.companyId, actorId: user.id, source: "system" });
    revalidateService();
    revalidatePath(`/hq/service/sites/${siteId}`);
    return { ok: true, data: { id: row.id, certificateNumber } };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Documents ─────────────────────────────

const docSchema = z.object({
  name: z.string().min(1, "Give the document a name.").max(200),
  url: z.string().url("Enter a full link, starting with https://").max(2000),
  category: z.string().max(40).default("general"),
  clientVisible: z.boolean().optional(),
});
export type DocumentInput = z.input<typeof docSchema>;

export async function addSiteDocument(siteId: string, input: DocumentInput): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = docSchema.parse(input);
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { companyId: true } });
    if (!site) return { ok: false, error: "Site not found." };
    const row = await prisma.document.create({ data: { name: d.name, url: d.url, category: d.category, clientVisible: d.clientVisible ?? false, siteId, companyId: site.companyId, uploadedById: user.id } });
    await logActivity({ type: "SYSTEM", subject: `Document added: ${d.name}`, siteId, companyId: site.companyId, actorId: user.id, source: "system" });
    revalidateService();
    revalidatePath(`/hq/service/sites/${siteId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDocument(id: string): Promise<Result> {
  try {
    const user = await actionStaff();
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return { ok: true };
    await prisma.document.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Document", entityId: id, before: { name: doc.name, url: doc.url } });
    revalidateService();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Robots ─────────────────────────────

const robotSchema = z.object({
  serialNumber: z.string().min(1, "Serial number is required.").max(120).transform((v) => v.trim()),
  assetTag: opt(80),
  productId: opt(),
  modelName: opt(120),
  oem: opt(80),
  siteId: opt(),
  companyId: opt(),
  status: z.enum(["IN_STOCK", "RESERVED", "DEPLOYED", "IN_SERVICE", "RETURNED", "RETIRED"]).default("IN_STOCK"),
  ownership: z.enum(["RAAS", "PURCHASED", "DEMO", "LOANER"]).default("RAAS"),
  installDate: optDate(),
  warrantyEnd: optDate(),
  raasTermEnd: optDate(),
  lastMaintenance: optDate(),
  maintenanceIntervalDays: optInt(1),
  firmwareVersion: opt(60),
  notes: z.string().max(10000).optional().nullable(),
});
export type RobotInput = z.input<typeof robotSchema>;

export async function saveRobot(input: RobotInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = robotSchema.parse(input);
    const dup = await prisma.robotUnit.findFirst({ where: { serialNumber: d.serialNumber, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
    if (dup) return { ok: false, error: `Serial ${d.serialNumber} is already on another unit.` };
    let modelName = d.modelName;
    let oem = d.oem;
    if (d.productId && (!modelName || !oem)) {
      const p = await prisma.product.findUnique({ where: { id: d.productId }, select: { name: true, oem: true } });
      modelName = modelName ?? p?.name ?? null;
      oem = oem ?? p?.oem ?? null;
    }
    let companyId = d.companyId;
    if (d.siteId) {
      const site = await prisma.site.findUnique({ where: { id: d.siteId }, select: { companyId: true } });
      if (!site) return { ok: false, error: "Site not found." };
      if (companyId && site.companyId !== companyId) return { ok: false, error: "That site belongs to a different company." };
      companyId = site.companyId;
    }
    const interval = d.maintenanceIntervalDays ?? (await defaultMaintenanceInterval());
    const existing = input.id ? await prisma.robotUnit.findUnique({ where: { id: input.id }, select: { nextMaintenance: true, status: true, lastMaintenance: true, installDate: true, maintenanceIntervalDays: true, siteId: true } }) : null;
    const scheduleChanged = existing ? existing.maintenanceIntervalDays !== interval || (existing.lastMaintenance?.getTime() ?? 0) !== (d.lastMaintenance?.getTime() ?? 0) || (existing.installDate?.getTime() ?? 0) !== (d.installDate?.getTime() ?? 0) : true;
    const nextMaintenance = !existing?.nextMaintenance || scheduleChanged ? computeNextMaintenance(d.lastMaintenance, d.installDate, interval) : existing.nextMaintenance;
    const data = {
      serialNumber: d.serialNumber,
      assetTag: d.assetTag,
      productId: d.productId,
      modelName,
      oem,
      siteId: d.siteId,
      companyId,
      status: d.status as RobotStatus,
      ownership: d.ownership as Ownership,
      installDate: d.installDate,
      warrantyEnd: d.warrantyEnd,
      raasTermEnd: d.raasTermEnd,
      lastMaintenance: d.lastMaintenance,
      nextMaintenance,
      maintenanceIntervalDays: interval,
      firmwareVersion: d.firmwareVersion,
      notes: d.notes || null,
    };
    let id = input.id;
    if (id) {
      await prisma.robotUnit.update({ where: { id }, data });
      if (existing && (existing.status !== d.status || existing.siteId !== d.siteId)) {
        await logActivity({ type: "SYSTEM", subject: `Robot ${d.serialNumber}: ${existing.status !== d.status ? `status ${d.status.replace(/_/g, " ").toLowerCase()}` : "moved to a different site"}`, siteId: d.siteId, companyId, actorId: user.id, source: "system" });
        await audit({ actorId: user.id, action: "update", entityType: "RobotUnit", entityId: id, before: { status: existing.status, siteId: existing.siteId }, after: { status: d.status, siteId: d.siteId } });
      }
    } else {
      const row = await prisma.robotUnit.create({ data });
      id = row.id;
      await logActivity({ type: "SYSTEM", subject: `Robot added: ${robotLabel({ modelName, oem, serialNumber: d.serialNumber })}`, siteId: d.siteId, companyId, actorId: user.id, source: "system" });
    }
    revalidateService();
    revalidatePath(`/hq/service/robots/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRobot(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const counts = await prisma.robotUnit.findUnique({ where: { id }, select: { serialNumber: true, _count: { select: { tickets: true } } } });
    if (counts && counts._count.tickets > 0) return { ok: false, error: "This robot has tickets attached. Set it to Retired instead of deleting it." };
    await prisma.robotUnit.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "RobotUnit", entityId: id, before: { serialNumber: counts?.serialNumber } });
    revalidateService();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const maintenanceSchema = z.object({
  type: z.string().max(40).default("scheduled"),
  performedAt: z.string().max(40).optional().nullable().transform((v) => (v ? new Date(v) : new Date())),
  notes: z.string().max(5000).optional().nullable(),
  partsUsed: z.string().max(2000).optional().nullable(),
});
export type MaintenanceInput = z.input<typeof maintenanceSchema>;

export async function logMaintenance(robotId: string, input: MaintenanceInput): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = maintenanceSchema.parse(input);
    const robot = await prisma.robotUnit.findUnique({ where: { id: robotId }, select: { serialNumber: true, modelName: true, oem: true, siteId: true, companyId: true, maintenanceIntervalDays: true, installDate: true, status: true } });
    if (!robot) return { ok: false, error: "Robot not found." };
    const parts = (d.partsUsed ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const row = await prisma.maintenanceLog.create({ data: { robotUnitId: robotId, type: d.type, performedAt: d.performedAt, performedById: user.id, notes: d.notes || null, partsUsed: parts.length ? parts : undefined } });
    const nextMaintenance = computeNextMaintenance(d.performedAt, robot.installDate, robot.maintenanceIntervalDays);
    await prisma.robotUnit.update({ where: { id: robotId }, data: { lastMaintenance: d.performedAt, nextMaintenance, status: robot.status === "IN_SERVICE" && d.type === "repair" ? "DEPLOYED" : undefined } });
    await logActivity({ type: "SYSTEM", subject: `Maintenance (${d.type}) on ${robotLabel(robot)}`, body: [d.notes, parts.length ? `Parts: ${parts.join(", ")}` : null].filter(Boolean).join("\n") || undefined, siteId: robot.siteId, companyId: robot.companyId, actorId: user.id, source: "system", occurredAt: d.performedAt });
    revalidateService();
    revalidatePath(`/hq/service/robots/${robotId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Tickets ─────────────────────────────

const ticketSchema = z.object({
  subject: z.string().min(1, "What is the problem? Give it a subject.").max(200),
  description: z.string().max(10000).optional().nullable(),
  category: z.string().max(40).default("other"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  companyId: opt(),
  siteId: opt(),
  robotUnitId: opt(),
  contactId: opt(),
  assigneeId: opt(),
  clientVisible: z.boolean().optional(),
});
export type TicketInput = z.input<typeof ticketSchema>;

export async function saveTicket(input: TicketInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = ticketSchema.parse(input);
    let companyId = d.companyId;
    if (!companyId && d.siteId) companyId = (await prisma.site.findUnique({ where: { id: d.siteId }, select: { companyId: true } }))?.companyId ?? null;
    if (!companyId && d.robotUnitId) companyId = (await prisma.robotUnit.findUnique({ where: { id: d.robotUnitId }, select: { companyId: true } }))?.companyId ?? null;
    const data = {
      subject: d.subject,
      description: d.description || null,
      category: d.category,
      priority: d.priority as TicketPriority,
      companyId,
      siteId: d.siteId,
      robotUnitId: d.robotUnitId,
      contactId: d.contactId,
      assigneeId: d.assigneeId,
      clientVisible: d.clientVisible ?? true,
    };
    let id = input.id;
    if (id) {
      const before = await prisma.ticket.findUnique({ where: { id }, select: { priority: true, assigneeId: true, createdAt: true, status: true, number: true } });
      if (!before) return { ok: false, error: "Ticket not found." };
      const slaDueAt = before.priority !== d.priority && !["RESOLVED", "CLOSED"].includes(before.status) ? await slaDueFor(d.priority, before.createdAt) : undefined;
      await prisma.ticket.update({ where: { id }, data: { ...data, slaDueAt } });
      if (before.assigneeId !== d.assigneeId && d.assigneeId && d.assigneeId !== user.id) {
        await notify({ userId: d.assigneeId, type: "ticket", title: `Ticket assigned to you: ${before.number}`, body: d.subject, link: `/hq/service/tickets/${id}` });
      }
      if (before.priority !== d.priority) {
        await audit({ actorId: user.id, action: "update", entityType: "Ticket", entityId: id, before: { priority: before.priority }, after: { priority: d.priority } });
        if (d.priority === "CRITICAL") await notifyTier({ minTier: "OWNER", type: "ticket", title: `Critical ticket: ${before.number}`, body: d.subject, link: `/hq/service/tickets/${id}`, exceptUserId: user.id });
      }
    } else {
      const number = await nextNumber("tickets");
      const slaDueAt = await slaDueFor(d.priority);
      const row = await prisma.ticket.create({ data: { ...data, number, slaDueAt, createdById: user.id, status: "NEW" } });
      id = row.id;
      await runEventAutomations("ticket.created", { ticketId: id });
      await logActivity({ type: "TICKET", subject: `${number} opened: ${d.subject}`, body: d.description || undefined, ticketId: id, companyId, siteId: d.siteId, contactId: d.contactId, actorId: user.id, source: "system" });
      if (d.assigneeId && d.assigneeId !== user.id) await notify({ userId: d.assigneeId, type: "ticket", title: `New ticket for you: ${number}`, body: `${d.priority === "CRITICAL" ? "Critical. " : ""}${d.subject}`, link: `/hq/service/tickets/${id}` });
      if (d.priority === "CRITICAL") await notifyTier({ minTier: "OWNER", type: "ticket", title: `Critical ticket: ${number}`, body: d.subject, link: `/hq/service/tickets/${id}`, exceptUserId: user.id });
      if (data.clientVisible) {
        const portalUsers = await portalUsersForTicket({ contactId: d.contactId, companyId });
        await Promise.all(portalUsers.map((uid) => notify({ userId: uid, type: "ticket", title: `Support ticket ${number} opened`, body: d.subject, link: `/portal/support/${id}` })));
      }
    }
    revalidateService();
    revalidatePath(`/hq/service/tickets/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

const ORDER: TicketStatus[] = ["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_OEM", "RESOLVED", "CLOSED"];

export async function setTicketStatus(id: string, status: TicketStatus, resolution?: string | null): Promise<Result> {
  try {
    const user = await actionCan("tickets.manage");
    if (!ORDER.includes(status)) return { ok: false, error: "Unknown status." };
    const t = await prisma.ticket.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "Ticket not found." };
    if (t.status === status) return { ok: true };
    const now = new Date();
    const text = (resolution ?? "").trim();
    if (status === "RESOLVED" && !text && !t.resolution) return { ok: false, error: "Write what fixed it before marking the ticket resolved." };
    const data = {
      status,
      firstResponseAt: t.firstResponseAt ?? (status !== "NEW" ? now : null),
      resolvedAt: status === "RESOLVED" ? now : status === "CLOSED" ? (t.resolvedAt ?? now) : ORDER.indexOf(status) < ORDER.indexOf("RESOLVED") ? null : t.resolvedAt,
      closedAt: status === "CLOSED" ? now : null,
      resolution: text ? text : status === "RESOLVED" || status === "CLOSED" ? t.resolution : t.resolution,
    };
    await prisma.ticket.update({ where: { id }, data });
    const label = ORDER.includes(status) ? status.replace(/_/g, " ").toLowerCase() : status;
    await logActivity({ type: "TICKET", subject: `${t.number} ${status === "RESOLVED" ? "resolved" : status === "CLOSED" ? "closed" : `moved to ${label}`}`, body: status === "RESOLVED" && text ? text : undefined, ticketId: id, companyId: t.companyId, siteId: t.siteId, contactId: t.contactId, actorId: user.id, source: "system" });
    await audit({ actorId: user.id, action: "status", entityType: "Ticket", entityId: id, before: { status: t.status }, after: { status } });
    if (t.clientVisible && (status === "RESOLVED" || status === "WAITING_CUSTOMER")) {
      const portalUsers = await portalUsersForTicket(t);
      const title = status === "RESOLVED" ? `Ticket ${t.number} is fixed` : `We need something from you on ${t.number}`;
      await Promise.all(portalUsers.map((uid) => notify({ userId: uid, type: "ticket", title, body: t.subject, link: `/portal/support/${id}` })));
    }
    if (t.assigneeId && t.assigneeId !== user.id && status !== "CLOSED") await notify({ userId: t.assigneeId, type: "ticket", title: `${t.number} ${label}`, body: t.subject, link: `/hq/service/tickets/${id}` });
    revalidateService();
    revalidatePath(`/hq/service/tickets/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function assignTicket(id: string, assigneeId: string | null): Promise<Result> {
  try {
    const user = await actionCan("tickets.manage");
    const t = await prisma.ticket.findUnique({ where: { id }, select: { number: true, subject: true, assigneeId: true, companyId: true, siteId: true } });
    if (!t) return { ok: false, error: "Ticket not found." };
    if (t.assigneeId === assigneeId) return { ok: true };
    await prisma.ticket.update({ where: { id }, data: { assigneeId } });
    const who = assigneeId ? await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } }) : null;
    await logActivity({ type: "TICKET", subject: `${t.number} ${assigneeId ? `assigned to ${who?.name ?? "someone"}` : "unassigned"}`, ticketId: id, companyId: t.companyId, siteId: t.siteId, actorId: user.id, source: "system" });
    if (assigneeId && assigneeId !== user.id) await notify({ userId: assigneeId, type: "ticket", title: `Ticket assigned to you: ${t.number}`, body: t.subject, link: `/hq/service/tickets/${id}` });
    revalidateService();
    revalidatePath(`/hq/service/tickets/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addTicketComment(ticketId: string, body: string, internal = false): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const text = body.trim();
    if (!text) return { ok: false, error: "Write something first." };
    if (text.length > 10000) return { ok: false, error: "That comment is too long." };
    const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!t) return { ok: false, error: "Ticket not found." };
    const row = await prisma.ticketComment.create({ data: { ticketId, authorId: user.id, body: text, internal } });
    await prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date(), firstResponseAt: !internal && !t.firstResponseAt ? new Date() : undefined } });
    await logActivity({ type: "TICKET", subject: internal ? `Internal note on ${t.number}` : `Reply on ${t.number}`, body: text, ticketId, companyId: t.companyId, siteId: t.siteId, contactId: internal ? null : t.contactId, actorId: user.id, source: "system", direction: internal ? "INTERNAL" : "OUTBOUND" });
    if (!internal && t.clientVisible) {
      const portalUsers = await portalUsersForTicket(t);
      await Promise.all(portalUsers.map((uid) => notify({ userId: uid, type: "ticket", title: `New reply on ${t.number}`, body: text.slice(0, 140), link: `/portal/support/${ticketId}` })));
    }
    if (t.assigneeId && t.assigneeId !== user.id) await notify({ userId: t.assigneeId, type: "ticket", title: `${internal ? "Internal note" : "Reply"} on ${t.number} from ${user.name}`, body: text.slice(0, 140), link: `/hq/service/tickets/${ticketId}` });
    revalidateService();
    revalidatePath(`/hq/service/tickets/${ticketId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTicket(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const t = await prisma.ticket.findUnique({ where: { id }, select: { number: true, subject: true } });
    await prisma.ticket.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Ticket", entityId: id, before: t });
    revalidateService();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
