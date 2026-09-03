// Performs automation actions against an entity context. Every action is idempotent for the
// same automation and entity: tasks, projects and deals carry a reference tag and are not
// created twice.
import { prisma } from "@/lib/prisma";
import { notify, notifyTier, logActivity } from "@/lib/audit";
import { appUrl, sendSystemMail } from "@/lib/mailer";
import { sendDigest, postSlack, resolveRecipients } from "@/lib/automations/digest";
import type { AutomationAction } from "@/lib/automations/triggers";
import type { DealType, TaskPriority } from "@/generated/prisma/enums";

export type EntityContext = {
  entityType: "Quote" | "Deal" | "Invoice" | "Ticket" | "RobotUnit" | "Schedule";
  entityId: string;
  label: string;
  link: string;
  companyId?: string | null;
  companyName?: string | null;
  industry?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  ticketId?: string | null;
  siteId?: string | null;
  ownerId?: string | null;
  quoteOwnerId?: string | null;
  dealOwnerId?: string | null;
  invoiceOwnerId?: string | null;
  siteTechnicianId?: string | null;
  assigneeId?: string | null;
  monthlyValue?: number | null;
  extra?: Record<string, string | number | null | undefined>;
};

export type ActionLog = { action: string; result: string; ok: boolean };

export function refTag(automationId: string, ctx: EntityContext): string {
  return `auto:${automationId}:${ctx.entityType}:${ctx.entityId}`;
}

export function fillTemplate(text: string, ctx: EntityContext): string {
  const vars: Record<string, string> = { entity: ctx.label, name: ctx.label, company: ctx.companyName ?? "", link: appUrl(ctx.link), ...Object.fromEntries(Object.entries(ctx.extra ?? {}).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])) };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}

async function resolveAssignee(key: string | undefined, ctx: EntityContext): Promise<string | null> {
  if (key?.startsWith("user:")) return key.slice(5) || null;
  const pick = {
    quote_owner: ctx.quoteOwnerId,
    deal_owner: ctx.dealOwnerId,
    invoice_owner: ctx.invoiceOwnerId,
    site_technician: ctx.siteTechnicianId,
  }[key ?? ""];
  if (pick) return pick;
  if (ctx.ownerId) return ctx.ownerId;
  if (ctx.assigneeId) return ctx.assigneeId;
  const owner = await prisma.user.findFirst({ where: { kind: "STAFF", status: "ACTIVE", tier: "OWNER" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return owner?.id ?? null;
}

export async function performActions(automation: { id: string; name: string }, ctx: EntityContext, actions: AutomationAction[]): Promise<{ log: ActionLog[]; errors: number }> {
  const log: ActionLog[] = [];
  const tag = refTag(automation.id, ctx);
  for (const a of actions) {
    try {
      switch (a.type) {
        case "create_task": {
          const title = fillTemplate(a.title, ctx);
          const existing = await prisma.task.findFirst({ where: { title, status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] }, OR: [{ tags: { has: tag } }, ...(ctx.dealId ? [{ dealId: ctx.dealId }] : []), ...(ctx.ticketId ? [{ ticketId: ctx.ticketId }] : []), ...(ctx.entityType === "Quote" || ctx.entityType === "Invoice" || ctx.entityType === "RobotUnit" ? [{ description: { contains: ctx.entityId } }] : [])] }, select: { id: true } });
          if (existing) {
            log.push({ action: "create_task", result: `Skipped, open task already exists (${existing.id})`, ok: true });
            break;
          }
          const assigneeId = await resolveAssignee(a.assignee, ctx);
          const sop = a.sop ? await prisma.sop.findUnique({ where: { slug: a.sop }, select: { id: true } }) : null;
          const due = new Date();
          due.setHours(17, 0, 0, 0);
          due.setDate(due.getDate() + (a.dueInDays ?? 0));
          const task = await prisma.task.create({
            data: {
              title,
              description: `${ctx.label}${ctx.companyName ? ` · ${ctx.companyName}` : ""}\n${appUrl(ctx.link)}\n\nCreated by the automation "${automation.name}". Ref ${ctx.entityType} ${ctx.entityId}.`,
              taskType: a.taskType ?? "follow_up",
              priority: (a.priority as TaskPriority | undefined) ?? "MEDIUM",
              dueAt: due,
              assigneeId,
              contactId: ctx.contactId ?? null,
              companyId: ctx.companyId ?? null,
              dealId: ctx.dealId ?? null,
              ticketId: ctx.ticketId ?? null,
              siteId: ctx.siteId ?? null,
              sopId: sop?.id ?? null,
              tags: [tag, "automation"],
              source: "automation",
            },
          });
          if (assigneeId) await notify({ userId: assigneeId, type: "task", title: `New task: ${title}`, body: ctx.label, link: `/hq/tasks?open=${task.id}` });
          log.push({ action: "create_task", result: `Created task ${task.id} for ${assigneeId ?? "nobody"}`, ok: true });
          break;
        }
        case "notify_tier": {
          await notifyTier({ minTier: a.tier === "OWNER" ? "OWNER" : "LEADERSHIP", type: "system", title: fillTemplate(a.title, ctx), body: ctx.label, link: ctx.link });
          log.push({ action: "notify_tier", result: `Notified ${a.tier.toLowerCase()}`, ok: true });
          break;
        }
        case "notify_assignee": {
          const who = ctx.assigneeId ?? ctx.ownerId ?? null;
          if (!who) {
            log.push({ action: "notify_assignee", result: "Nobody is assigned, skipped", ok: true });
            break;
          }
          await notify({ userId: who, type: "system", title: fillTemplate(a.title ?? `${automation.name}: ${ctx.label}`, ctx), body: ctx.companyName ?? undefined, link: ctx.link });
          log.push({ action: "notify_assignee", result: `Notified ${who}`, ok: true });
          break;
        }
        case "notify_department": {
          const users = await prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", department: { slug: a.department.toLowerCase() } }, select: { id: true } });
          await Promise.all(users.map((u) => notify({ userId: u.id, type: "system", title: fillTemplate(a.title, ctx), body: ctx.label, link: ctx.link })));
          log.push({ action: "notify_department", result: `Notified ${users.length} in ${a.department}`, ok: true });
          break;
        }
        case "create_project": {
          const existing = await prisma.project.findFirst({ where: { type: a.projectType, OR: [{ tags: { has: tag } }, ...(ctx.dealId ? [{ dealId: ctx.dealId }] : [])] }, select: { id: true } });
          if (existing) {
            log.push({ action: "create_project", result: `Skipped, project already exists (${existing.id})`, ok: true });
            break;
          }
          const ownerId = await resolveAssignee("deal_owner", ctx);
          const project = await prisma.project.create({ data: { name: `${a.projectType.charAt(0).toUpperCase()}${a.projectType.slice(1)}: ${ctx.companyName ?? ctx.label}`, type: a.projectType, status: "PLANNING", ownerId, companyId: ctx.companyId ?? null, dealId: ctx.dealId ?? null, siteId: ctx.siteId ?? null, tags: [tag, "automation"] } });
          log.push({ action: "create_project", result: `Created project ${project.id}`, ok: true });
          break;
        }
        case "create_deal": {
          const existing = await prisma.deal.findFirst({ where: { tags: { has: tag } }, select: { id: true } });
          if (existing) {
            log.push({ action: "create_deal", result: `Skipped, deal already exists (${existing.id})`, ok: true });
            break;
          }
          const ownerId = await resolveAssignee("deal_owner", ctx);
          const deal = await prisma.deal.create({ data: { name: `${ctx.companyName ?? ctx.label} ${a.dealType.toLowerCase().replace(/_/g, " ")}`, dealType: a.dealType as DealType, stageKey: "new", companyId: ctx.companyId ?? null, ownerId, monthlyValue: ctx.monthlyValue ?? 0, nextStep: `Confirm the ${a.dealType.toLowerCase()} terms`, nextStepDueAt: new Date(Date.now() + 7 * 86400000), lastActivityAt: new Date(), tags: [tag, "automation"], notes: `Created by the automation "${automation.name}" from ${ctx.label}.` } });
          await logActivity({ type: "SYSTEM", subject: `Deal created by automation: ${automation.name}`, dealId: deal.id, companyId: ctx.companyId, source: "automation", actorLabel: "automation" });
          if (ownerId) await notify({ userId: ownerId, type: "deal", title: `New ${a.dealType.toLowerCase()} deal`, body: deal.name, link: `/hq/deals/${deal.id}` });
          log.push({ action: "create_deal", result: `Created deal ${deal.id}`, ok: true });
          break;
        }
        case "digest": {
          const r = await sendDigest({ to: a.to, report: a.report });
          log.push({ action: "digest", result: `${a.report} to ${r.recipients.length} recipient${r.recipients.length === 1 ? "" : "s"}${r.delivered ? "" : " (SMTP not configured, logged only)"}${r.slack ? ", posted to Slack" : ""}${r.reason ? `. ${r.reason}` : ""}`, ok: true });
          break;
        }
        case "slack": {
          const r = await postSlack(fillTemplate(a.text, ctx));
          log.push({ action: "slack", result: r.ok ? "Posted to Slack" : `Slack skipped: ${r.reason}`, ok: r.ok });
          break;
        }
        case "email": {
          const recipients = await resolveRecipients(a.toRole);
          let delivered = 0;
          for (const r of recipients) {
            const res = await sendSystemMail({ to: r.email, subject: fillTemplate(a.subject, ctx), html: `<p>${fillTemplate(a.body, ctx).replace(/\n/g, "<br/>")}</p><p><a href="${appUrl(ctx.link)}">Open in Spectrum HQ</a></p>` });
            if (res.delivered) delivered++;
          }
          log.push({ action: "email", result: `${recipients.length} recipient${recipients.length === 1 ? "" : "s"}, ${delivered} delivered${delivered === 0 && recipients.length ? " (SMTP not configured, logged only)" : ""}`, ok: true });
          break;
        }
        default:
          log.push({ action: (a as { type: string }).type, result: "Unknown action type, skipped", ok: false });
      }
    } catch (e) {
      log.push({ action: a.type, result: e instanceof Error ? e.message : "Failed", ok: false });
    }
  }
  return { log, errors: log.filter((l) => !l.ok).length };
}
