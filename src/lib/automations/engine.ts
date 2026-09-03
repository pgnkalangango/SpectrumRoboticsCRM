// Automation engine. runScheduledAutomations(now) is called by the cron route; runEventAutomations
// is exported for the ticket and deal modules to call when those events happen.
import { prisma } from "@/lib/prisma";
import { performActions, type EntityContext } from "@/lib/automations/actions";
import { cronMatches, parseActions, parseConditions, parseTrigger, triggerKind, type Condition, type Trigger } from "@/lib/automations/triggers";
import type { Automation, Deal, Invoice, PipelineStage, Quote, RobotUnit, Ticket } from "@/generated/prisma/client";

export type AutomationRunSummary = { automationId: string; name: string; matched: number; ran: number; skipped: number; errors: number; notes: string[] };
export type EngineSummary = { at: string; automations: number; ran: number; errors: number; details: AutomationRunSummary[] };

const daysAgo = (now: Date, d: number) => new Date(now.getTime() - d * 86400000);
const daysAhead = (now: Date, d: number) => new Date(now.getTime() + d * 86400000);

// ───────────────────────────── Contexts ─────────────────────────────

type QuoteRow = Quote & { company: { name: string; industry: string | null } | null };
type DealRow = Deal & { company: { name: string; industry: string | null } | null; stage: PipelineStage };
type InvoiceRow = Invoice & { company: { name: string; industry: string | null } | null };
type RobotRow = RobotUnit & { company: { name: string; industry: string | null } | null; site: { id: string; name: string; technicianId: string | null; accountManagerId: string | null } | null };
type TicketRow = Ticket & { company: { name: string; industry: string | null } | null; site: { technicianId: string | null; accountManagerId: string | null } | null };

function quoteContext(q: QuoteRow): EntityContext {
  return { entityType: "Quote", entityId: q.id, label: `Quote ${q.number}: ${q.title}`, link: `/hq/quotes/${q.id}`, companyId: q.companyId, companyName: q.company?.name, industry: q.company?.industry, contactId: q.contactId, dealId: q.dealId, ownerId: q.ownerId, quoteOwnerId: q.ownerId, dealOwnerId: q.ownerId, extra: { number: q.number, total: Number(q.total) } };
}
function dealContext(d: DealRow): EntityContext {
  return { entityType: "Deal", entityId: d.id, label: `Deal: ${d.name}`, link: `/hq/deals/${d.id}`, companyId: d.companyId, companyName: d.company?.name, industry: d.company?.industry, contactId: d.primaryContactId, dealId: d.id, ownerId: d.ownerId, dealOwnerId: d.ownerId, quoteOwnerId: d.ownerId, assigneeId: d.ownerId, monthlyValue: Number(d.monthlyValue), extra: { stage: d.stage.label, value: Number(d.value) } };
}
function invoiceContext(i: InvoiceRow): EntityContext {
  return { entityType: "Invoice", entityId: i.id, label: `Invoice ${i.number}`, link: `/hq/invoices/${i.id}`, companyId: i.companyId, companyName: i.company?.name, industry: i.company?.industry, contactId: i.contactId, dealId: i.dealId, ownerId: i.ownerId, invoiceOwnerId: i.ownerId, dealOwnerId: i.ownerId, extra: { number: i.number, balance: Number(i.balanceDue) } };
}
function robotContext(r: RobotRow): EntityContext {
  return { entityType: "RobotUnit", entityId: r.id, label: `${r.modelName ?? r.oem ?? "Robot"} ${r.serialNumber}${r.site ? ` at ${r.site.name}` : ""}`, link: `/hq/service/robots/${r.id}`, companyId: r.companyId, companyName: r.company?.name, industry: r.company?.industry, siteId: r.siteId, ownerId: r.site?.accountManagerId ?? null, dealOwnerId: r.site?.accountManagerId ?? null, siteTechnicianId: r.site?.technicianId ?? null, assigneeId: r.site?.technicianId ?? r.site?.accountManagerId ?? null, extra: { serial: r.serialNumber } };
}
function ticketContext(t: TicketRow): EntityContext {
  return { entityType: "Ticket", entityId: t.id, label: `Ticket ${t.number}: ${t.subject}`, link: `/hq/service/tickets/${t.id}`, companyId: t.companyId, companyName: t.company?.name, industry: t.company?.industry, contactId: t.contactId, ticketId: t.id, siteId: t.siteId, ownerId: t.assigneeId ?? t.site?.accountManagerId ?? null, assigneeId: t.assigneeId ?? t.site?.technicianId ?? null, siteTechnicianId: t.site?.technicianId ?? null, extra: { number: t.number, priority: t.priority } };
}

function passesConditions(conditions: Condition[], ctx: EntityContext): boolean {
  return conditions.every((c) => {
    if (c.field === "owner") return ctx.ownerId === c.value;
    if (c.field === "industry") return (ctx.industry ?? "").toLowerCase() === c.value.toLowerCase();
    return true;
  });
}

// A run is recorded per automation and entity, optionally keyed by a value in the log (offset, due date).
async function alreadyRan(automationId: string, entityId: string, key?: { field: string; value: string | number }): Promise<boolean> {
  const row = await prisma.automationRun.findFirst({ where: { automationId, entityId, status: { in: ["ok", "error"] }, ...(key ? { log: { path: [key.field], equals: key.value } } : {}) }, select: { id: true } });
  return !!row;
}

// ───────────────────────────── Candidates per trigger ─────────────────────────────

type Candidate = { ctx: EntityContext; key?: { field: string; value: string | number } };

async function candidatesFor(trigger: Trigger, now: Date): Promise<Candidate[]> {
  const companySel = { select: { name: true, industry: true } };
  switch (trigger.type) {
    case "quote.unviewed": {
      const rows = await prisma.quote.findMany({ where: { status: "SENT", viewedAt: null, sentAt: { lte: daysAgo(now, trigger.afterDays ?? 3) } }, include: { company: companySel } });
      return rows.map((q) => ({ ctx: quoteContext(q) }));
    }
    case "quote.viewed_no_response": {
      const rows = await prisma.quote.findMany({ where: { status: { in: ["SENT", "VIEWED"] }, respondedAt: null, viewedAt: { lte: daysAgo(now, trigger.afterDays ?? 5) } }, include: { company: companySel } });
      return rows.map((q) => ({ ctx: quoteContext(q) }));
    }
    case "deal.stale": {
      const cutoff = daysAgo(now, trigger.afterDays ?? 14);
      const rows = await prisma.deal.findMany({ where: { stage: { isWon: false, isLost: false }, OR: [{ lastActivityAt: { lte: cutoff } }, { lastActivityAt: null, createdAt: { lte: cutoff } }] }, include: { company: companySel, stage: true } });
      // Re-fires once the deal gets new activity and goes quiet again.
      return rows.map((d) => ({ ctx: dealContext(d), key: { field: "since", value: (d.lastActivityAt ?? d.createdAt).toISOString() } }));
    }
    case "invoice.overdue": {
      const offsets = [...(trigger.days?.length ? trigger.days : [1])].sort((a, b) => a - b);
      const rows = await prisma.invoice.findMany({ where: { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID", "OVERDUE"] }, dueDate: { lt: now } }, include: { company: companySel } });
      const out: Candidate[] = [];
      for (const inv of rows) {
        const late = (now.getTime() - inv.dueDate!.getTime()) / 86400000;
        const applicable = offsets.filter((d) => late >= d);
        if (!applicable.length) continue;
        // Only the largest offset that has passed fires; earlier ones are considered covered.
        out.push({ ctx: invoiceContext(inv), key: { field: "offset", value: applicable[applicable.length - 1] } });
      }
      return out;
    }
    case "robot.maintenance_due": {
      const rows = await prisma.robotUnit.findMany({ where: { status: { in: ["DEPLOYED", "IN_SERVICE"] }, nextMaintenance: { gte: daysAgo(now, 1), lte: daysAhead(now, trigger.beforeDays ?? 14) } }, include: { company: companySel, site: { select: { id: true, name: true, technicianId: true, accountManagerId: true } } } });
      return rows.map((r) => ({ ctx: robotContext(r), key: { field: "due", value: r.nextMaintenance!.toISOString().slice(0, 10) } }));
    }
    case "robot.raas_ending": {
      const rows = await prisma.robotUnit.findMany({ where: { ownership: "RAAS", status: { in: ["DEPLOYED", "IN_SERVICE"] }, raasTermEnd: { gte: daysAgo(now, 1), lte: daysAhead(now, trigger.beforeDays ?? 60) } }, include: { company: companySel, site: { select: { id: true, name: true, technicianId: true, accountManagerId: true } } } });
      return rows.map((r) => ({ ctx: robotContext(r), key: { field: "due", value: r.raasTermEnd!.toISOString().slice(0, 10) } }));
    }
    default:
      return [];
  }
}

// ───────────────────────────── Running ─────────────────────────────

async function runOne(automation: Automation, now: Date, opts: { force?: boolean } = {}): Promise<AutomationRunSummary> {
  const summary: AutomationRunSummary = { automationId: automation.id, name: automation.name, matched: 0, ran: 0, skipped: 0, errors: 0, notes: [] };
  const trigger = parseTrigger(automation.trigger);
  const actions = parseActions(automation.actions);
  const conditions = parseConditions(automation.conditions);
  const kind = triggerKind(trigger.type);

  if (kind === "event") {
    summary.notes.push("Event trigger, runs when the event happens");
    return summary;
  }

  if (kind === "schedule") {
    const recentlyRan = automation.lastRunAt && now.getTime() - automation.lastRunAt.getTime() < 50 * 60000;
    if (!opts.force && (!trigger.cron || !cronMatches(trigger.cron, now) || recentlyRan)) {
      summary.notes.push(recentlyRan ? "Ran less than 50 minutes ago" : "Schedule does not match this minute");
      return summary;
    }
    summary.matched = 1;
    const ctx: EntityContext = { entityType: "Schedule", entityId: automation.id, label: automation.name, link: "/hq/automations" };
    const started = new Date();
    const result = await performActions(automation, ctx, actions);
    await prisma.automationRun.create({ data: { automationId: automation.id, status: result.errors ? "error" : "ok", entityType: "Schedule", entityId: automation.id, log: { actions: result.log, forced: !!opts.force }, startedAt: started, finishedAt: new Date() } });
    await prisma.automation.update({ where: { id: automation.id }, data: { lastRunAt: now, runCount: { increment: 1 } } });
    summary.ran = 1;
    summary.errors = result.errors;
    return summary;
  }

  const candidates = await candidatesFor(trigger, now);
  summary.matched = candidates.length;
  for (const c of candidates) {
    if (!passesConditions(conditions, c.ctx)) {
      summary.skipped++;
      continue;
    }
    if (await alreadyRan(automation.id, c.ctx.entityId, c.key)) {
      summary.skipped++;
      continue;
    }
    const started = new Date();
    const result = await performActions(automation, c.ctx, actions);
    await prisma.automationRun.create({ data: { automationId: automation.id, status: result.errors ? "error" : "ok", entityType: c.ctx.entityType, entityId: c.ctx.entityId, log: { ...(c.key ? { [c.key.field]: c.key.value } : {}), label: c.ctx.label, actions: result.log }, startedAt: started, finishedAt: new Date() } });
    summary.ran++;
    summary.errors += result.errors;
  }
  if (summary.ran > 0) await prisma.automation.update({ where: { id: automation.id }, data: { lastRunAt: now, runCount: { increment: summary.ran } } });
  else await prisma.automation.update({ where: { id: automation.id }, data: { lastRunAt: now } });
  return summary;
}

export async function runScheduledAutomations(now = new Date()): Promise<EngineSummary> {
  const automations = await prisma.automation.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  const details: AutomationRunSummary[] = [];
  for (const a of automations) {
    try {
      details.push(await runOne(a, now));
    } catch (e) {
      details.push({ automationId: a.id, name: a.name, matched: 0, ran: 0, skipped: 0, errors: 1, notes: [e instanceof Error ? e.message : "Failed"] });
      await prisma.automationRun.create({ data: { automationId: a.id, status: "error", log: { error: e instanceof Error ? e.message : String(e) }, finishedAt: new Date() } }).catch(() => null);
    }
  }
  return { at: now.toISOString(), automations: automations.length, ran: details.reduce((s, d) => s + d.ran, 0), errors: details.reduce((s, d) => s + d.errors, 0), details };
}

// "Run now" from the UI: schedules fire immediately, time based triggers are evaluated right away.
export async function runAutomationNow(id: string, now = new Date()): Promise<AutomationRunSummary> {
  const automation = await prisma.automation.findUnique({ where: { id } });
  if (!automation) throw new Error("Automation not found.");
  return runOne(automation, now, { force: true });
}

// ───────────────────────────── Event triggers ─────────────────────────────
// Call from the modules that own the events:
//   runEventAutomations("ticket.created", { ticketId })            after a ticket is created
//   runEventAutomations("deal.stage_changed", { dealId, from, to }) after a deal changes stage
// Never throws; failures are recorded as AutomationRun rows.

export type AutomationEvent = "ticket.created" | "deal.stage_changed";
export type EventPayload = { ticketId?: string; dealId?: string; from?: string; to?: string };

export async function runEventAutomations(eventType: AutomationEvent, payload: EventPayload): Promise<AutomationRunSummary[]> {
  const out: AutomationRunSummary[] = [];
  try {
    const automations = await prisma.automation.findMany({ where: { enabled: true } });
    let ctx: EntityContext | null = null;
    let eventValue: Record<string, string | undefined> = {};
    if (eventType === "ticket.created" && payload.ticketId) {
      const t = await prisma.ticket.findUnique({ where: { id: payload.ticketId }, include: { company: { select: { name: true, industry: true } }, site: { select: { technicianId: true, accountManagerId: true } } } });
      if (!t) return out;
      ctx = ticketContext(t);
      eventValue = { priority: t.priority };
    } else if (eventType === "deal.stage_changed" && payload.dealId) {
      const d = await prisma.deal.findUnique({ where: { id: payload.dealId }, include: { company: { select: { name: true, industry: true } }, stage: true } });
      if (!d) return out;
      ctx = dealContext(d);
      eventValue = { to: payload.to ?? d.stageKey, from: payload.from };
    }
    if (!ctx) return out;

    for (const a of automations) {
      const trigger = parseTrigger(a.trigger);
      if (trigger.type !== eventType) continue;
      if (eventType === "ticket.created" && trigger.priority && trigger.priority !== eventValue.priority) continue;
      if (eventType === "deal.stage_changed" && ((trigger.to && trigger.to !== eventValue.to) || (trigger.from && trigger.from !== eventValue.from))) continue;
      if (!passesConditions(parseConditions(a.conditions), ctx)) continue;
      const key = eventType === "deal.stage_changed" ? { field: "to", value: eventValue.to ?? "" } : undefined;
      if (await alreadyRan(a.id, ctx.entityId, key)) {
        out.push({ automationId: a.id, name: a.name, matched: 1, ran: 0, skipped: 1, errors: 0, notes: ["Already ran for this record"] });
        continue;
      }
      const started = new Date();
      const result = await performActions(a, ctx, parseActions(a.actions));
      await prisma.automationRun.create({ data: { automationId: a.id, status: result.errors ? "error" : "ok", entityType: ctx.entityType, entityId: ctx.entityId, log: { ...(key ? { [key.field]: key.value } : {}), label: ctx.label, event: eventType, actions: result.log }, startedAt: started, finishedAt: new Date() } });
      await prisma.automation.update({ where: { id: a.id }, data: { lastRunAt: new Date(), runCount: { increment: 1 } } });
      out.push({ automationId: a.id, name: a.name, matched: 1, ran: 1, skipped: 0, errors: result.errors, notes: [] });
    }
  } catch (e) {
    console.warn("runEventAutomations failed", e);
  }
  return out;
}
