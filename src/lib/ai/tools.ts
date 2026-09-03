import { prisma } from "@/lib/prisma";
import { fullName, money } from "@/lib/utils";
import { getSetting } from "@/lib/settings";
import { getMailProvider } from "@/lib/mail/provider";
import { mailStats } from "@/lib/mail/sync";
import { logActivity } from "@/lib/audit";
import type { Tier } from "@/generated/prisma/enums";

// One tool registry shared by the in app assistant and the HQ MCP server. Every tool runs as a
// specific person: it sees what they can see, and writes are attributed to them.
export type ToolScope = "read" | "draft" | "write";
export type ToolContext = { userId: string; email: string; name: string; tier: Tier; scopes: ToolScope[] };
export type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
export type HqTool = {
  name: string;
  description: string;
  input_schema: JsonSchema;
  scope: ToolScope;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const s = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : undefined);
const n = (v: unknown, d?: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const like = (q: string) => ({ contains: q, mode: "insensitive" as const });

export const HQ_TOOLS: HqTool[] = [
  {
    name: "search_crm",
    description: "Search contacts, companies, deals, quotes and tickets by name, email, company, number or subject. Use this first when the user mentions a person or company.",
    input_schema: { type: "object", properties: { query: str("Words to search for"), types: { type: "array", items: { type: "string", enum: ["contact", "company", "deal", "quote", "ticket"] }, description: "Limit to these record types" } }, required: ["query"] },
    scope: "read",
    async run(a) {
      const q = s(a.query, 100) ?? "";
      const types = (Array.isArray(a.types) ? (a.types as string[]) : ["contact", "company", "deal", "quote", "ticket"]);
      const out: Record<string, unknown[]> = {};
      if (types.includes("contact")) out.contacts = (await prisma.contact.findMany({ where: { OR: [{ firstName: like(q) }, { lastName: like(q) }, { email: like(q) }, { companyName: like(q) }, { company: { name: like(q) } }] }, take: 8, include: { company: { select: { name: true } } } })).map((c) => ({ id: c.id, name: fullName(c), email: c.email, title: c.jobTitle, company: c.company?.name ?? c.companyName, type: c.type, doNotContact: c.doNotContact, lastContactedAt: c.lastContactedAt }));
      if (types.includes("company")) out.companies = (await prisma.company.findMany({ where: { OR: [{ name: like(q) }, { domain: like(q) }] }, take: 8 })).map((c) => ({ id: c.id, name: c.name, industry: c.industry, status: c.status, city: c.addressCity, state: c.addressState, domain: c.domain }));
      if (types.includes("deal")) out.deals = (await prisma.deal.findMany({ where: { OR: [{ name: like(q) }, { company: { name: like(q) } }] }, take: 8, include: { stage: true, company: { select: { name: true } }, owner: { select: { name: true } } } })).map((d) => ({ id: d.id, name: d.name, company: d.company?.name, stage: d.stage.label, value: Number(d.value), monthlyValue: Number(d.monthlyValue), owner: d.owner?.name, nextStep: d.nextStep, nextStepDueAt: d.nextStepDueAt, lastActivityAt: d.lastActivityAt }));
      if (types.includes("quote")) out.quotes = (await prisma.quote.findMany({ where: { OR: [{ number: like(q) }, { title: like(q) }, { company: { name: like(q) } }] }, take: 8, include: { company: { select: { name: true } } } })).map((x) => ({ id: x.id, number: x.number, title: x.title, company: x.company?.name, status: x.status, total: Number(x.total), monthlyTotal: Number(x.monthlyTotal), sentAt: x.sentAt, viewedAt: x.viewedAt, validUntil: x.validUntil }));
      if (types.includes("ticket")) out.tickets = (await prisma.ticket.findMany({ where: { OR: [{ number: like(q) }, { subject: like(q) }, { company: { name: like(q) } }] }, take: 8, include: { company: { select: { name: true } }, assignee: { select: { name: true } } } })).map((t) => ({ id: t.id, number: t.number, subject: t.subject, company: t.company?.name, status: t.status, priority: t.priority, assignee: t.assignee?.name, slaDueAt: t.slaDueAt }));
      return out;
    },
  },
  {
    name: "get_record",
    description: "Get one record with its details and recent timeline: contact, company, deal, quote, ticket, site or robot.",
    input_schema: { type: "object", properties: { type: { type: "string", enum: ["contact", "company", "deal", "quote", "ticket", "site", "robot"] }, id: str("Record id from search_crm") }, required: ["type", "id"] },
    scope: "read",
    async run(a) {
      const id = s(a.id, 60) ?? "";
      const type = s(a.type, 20);
      const timeline = async (where: Record<string, string>) => (await prisma.activity.findMany({ where, orderBy: { occurredAt: "desc" }, take: 20, include: { actor: { select: { name: true } } } })).map((x) => ({ type: x.type, subject: x.subject, body: x.body?.slice(0, 600), when: x.occurredAt, by: x.actor?.name ?? x.actorLabel ?? "system", direction: x.direction }));
      switch (type) {
        case "contact": {
          const c = await prisma.contact.findUnique({ where: { id }, include: { company: { select: { id: true, name: true } }, owner: { select: { name: true } }, deals: { include: { deal: { include: { stage: true } } } }, quotes: { take: 5, orderBy: { updatedAt: "desc" } }, tasks: { where: { status: { in: ["TODO", "IN_PROGRESS"] } }, take: 10 } } });
          if (!c) return { error: "Not found" };
          return { contact: { id: c.id, name: fullName(c), email: c.email, phone: c.phoneMobile ?? c.phoneOffice, title: c.jobTitle, company: c.company, type: c.type, source: c.leadSource, owner: c.owner?.name, doNotContact: c.doNotContact, notes: c.notes, tags: c.tags, lastContactedAt: c.lastContactedAt, researchBrief: c.researchBrief }, deals: c.deals.map((d) => ({ id: d.deal.id, name: d.deal.name, stage: d.deal.stage.label, value: Number(d.deal.value), nextStep: d.deal.nextStep })), quotes: c.quotes.map((q) => ({ id: q.id, number: q.number, title: q.title, status: q.status, total: Number(q.total) })), openTasks: c.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt })), timeline: await timeline({ contactId: id }) };
        }
        case "company": {
          const c = await prisma.company.findUnique({ where: { id }, include: { contacts: { take: 20, where: { status: "active" } }, deals: { include: { stage: true } }, sites: true, robots: true, tickets: { where: { status: { notIn: ["CLOSED"] } }, take: 10 }, invoices: { take: 10, orderBy: { updatedAt: "desc" } } } });
          if (!c) return { error: "Not found" };
          return { company: { id: c.id, name: c.name, industry: c.industry, status: c.status, address: [c.addressStreet, c.addressCity, c.addressState].filter(Boolean).join(", "), website: c.website, notes: c.notes, portalEnabled: c.portalEnabled }, people: c.contacts.map((p) => ({ id: p.id, name: fullName(p), title: p.jobTitle, email: p.email })), deals: c.deals.map((d) => ({ id: d.id, name: d.name, stage: d.stage.label, value: Number(d.value), monthlyValue: Number(d.monthlyValue), nextStep: d.nextStep })), sites: c.sites.map((x) => ({ id: x.id, name: x.name, status: x.status })), robots: c.robots.map((r) => ({ id: r.id, serial: r.serialNumber, model: r.modelName, status: r.status, nextMaintenance: r.nextMaintenance })), openTickets: c.tickets.map((t) => ({ id: t.id, number: t.number, subject: t.subject, status: t.status, priority: t.priority })), invoices: c.invoices.map((i) => ({ number: i.number, status: i.status, total: Number(i.total), balanceDue: Number(i.balanceDue), dueDate: i.dueDate })), timeline: await timeline({ companyId: id }) };
        }
        case "deal": {
          const d = await prisma.deal.findUnique({ where: { id }, include: { stage: true, company: { select: { name: true } }, primaryContact: true, owner: { select: { name: true, email: true } }, quotes: true, tasks: { where: { status: { in: ["TODO", "IN_PROGRESS"] } } } } });
          if (!d) return { error: "Not found" };
          return { deal: { id: d.id, name: d.name, company: d.company?.name, contact: d.primaryContact ? { id: d.primaryContact.id, name: fullName(d.primaryContact), email: d.primaryContact.email } : null, stage: d.stage.label, probability: d.probability ?? d.stage.probability, value: Number(d.value), monthlyValue: Number(d.monthlyValue), owner: d.owner?.name, nextStep: d.nextStep, nextStepDueAt: d.nextStepDueAt, expectedCloseDate: d.expectedCloseDate, lostReason: d.lostReason, notes: d.notes, lastActivityAt: d.lastActivityAt }, quotes: d.quotes.map((q) => ({ id: q.id, number: q.number, status: q.status, total: Number(q.total), sentAt: q.sentAt, viewedAt: q.viewedAt })), openTasks: d.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt })), timeline: await timeline({ dealId: id }) };
        }
        case "quote": {
          const q = await prisma.quote.findUnique({ where: { id }, include: { lines: true, company: { select: { name: true } }, contact: true, owner: { select: { name: true } } } });
          if (!q) return { error: "Not found" };
          return { quote: { id: q.id, number: q.number, title: q.title, status: q.status, company: q.company?.name, contact: q.contact ? { name: fullName(q.contact), email: q.contact.email } : null, owner: q.owner?.name, validUntil: q.validUntil, sentAt: q.sentAt, viewedAt: q.viewedAt, respondedAt: q.respondedAt, subtotal: Number(q.subtotal), discountTotal: Number(q.discountTotal), deliveryFee: Number(q.deliveryFee), installFee: Number(q.installFee), tax: Number(q.taxAmount), oneTimeTotal: Number(q.oneTimeTotal), monthlyTotal: Number(q.monthlyTotal), total: Number(q.total), notes: q.notes, terms: q.terms }, lines: q.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: Number(l.unitPrice), pricingMode: l.pricingMode, discountPct: Number(l.discountPct), total: Number(l.total) })), timeline: await timeline({ quoteId: id }) };
        }
        case "ticket": {
          const t = await prisma.ticket.findUnique({ where: { id }, include: { company: { select: { name: true } }, site: { select: { name: true } }, robotUnit: { select: { serialNumber: true, modelName: true } }, assignee: { select: { name: true } }, comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } } });
          if (!t) return { error: "Not found" };
          return { ticket: { id: t.id, number: t.number, subject: t.subject, description: t.description, category: t.category, priority: t.priority, status: t.status, company: t.company?.name, site: t.site?.name, robot: t.robotUnit ? `${t.robotUnit.modelName ?? ""} ${t.robotUnit.serialNumber}` : null, assignee: t.assignee?.name, slaDueAt: t.slaDueAt, resolvedAt: t.resolvedAt, resolution: t.resolution }, comments: t.comments.map((c) => ({ by: c.author?.name, internal: c.internal, body: c.body, at: c.createdAt })) };
        }
        case "site": {
          const x = await prisma.site.findUnique({ where: { id }, include: { company: { select: { name: true } }, robots: true, tickets: { where: { status: { notIn: ["CLOSED"] } } } } });
          if (!x) return { error: "Not found" };
          return { site: { ...x, robots: x.robots.map((r) => ({ serial: r.serialNumber, model: r.modelName, status: r.status, nextMaintenance: r.nextMaintenance })), openTickets: x.tickets.length }, timeline: await timeline({ siteId: id }) };
        }
        case "robot": {
          const r = await prisma.robotUnit.findUnique({ where: { id }, include: { site: { select: { name: true } }, company: { select: { name: true } }, maintenanceLogs: { orderBy: { performedAt: "desc" }, take: 10 } } });
          if (!r) return { error: "Not found" };
          return { robot: { serial: r.serialNumber, model: r.modelName, oem: r.oem, status: r.status, ownership: r.ownership, site: r.site?.name, company: r.company?.name, installDate: r.installDate, warrantyEnd: r.warrantyEnd, raasTermEnd: r.raasTermEnd, nextMaintenance: r.nextMaintenance, firmware: r.firmwareVersion, notes: r.notes }, maintenance: r.maintenanceLogs.map((m) => ({ type: m.type, at: m.performedAt, notes: m.notes })) };
        }
      }
      return { error: "Unknown type" };
    },
  },
  {
    name: "pipeline_summary",
    description: "Open pipeline by stage with counts and values, stale deals, deals without a next step, and quotes waiting on a reply. Optionally for one owner.",
    input_schema: { type: "object", properties: { ownerEmail: str("Limit to this team member's deals (email)"), mine: { type: "boolean", description: "Only the current user's deals" } } },
    scope: "read",
    async run(a, ctx) {
      const owner = a.mine ? { ownerId: ctx.userId } : a.ownerEmail ? { owner: { email: s(a.ownerEmail, 200) } } : {};
      const pipeline = await getSetting("pipeline");
      const staleBefore = new Date(Date.now() - pipeline.staleDays * 86400000);
      const deals = await prisma.deal.findMany({ where: { ...owner, stage: { isWon: false, isLost: false } }, include: { stage: true, company: { select: { name: true } }, owner: { select: { name: true } } } });
      const byStage: Record<string, { count: number; value: number; monthly: number }> = {};
      for (const d of deals) {
        const b = (byStage[d.stage.label] ??= { count: 0, value: 0, monthly: 0 });
        b.count++;
        b.value += Number(d.value);
        b.monthly += Number(d.monthlyValue);
      }
      const quotes = await prisma.quote.findMany({ where: { status: { in: ["SENT", "VIEWED", "PENDING_APPROVAL"] }, ...(a.mine ? { ownerId: ctx.userId } : {}) }, include: { company: { select: { name: true } } }, take: 25 });
      return {
        openDeals: deals.length,
        openValue: deals.reduce((x, d) => x + Number(d.value), 0),
        openMonthly: deals.reduce((x, d) => x + Number(d.monthlyValue), 0),
        weightedValue: Math.round(deals.reduce((x, d) => x + (Number(d.value) * (d.probability ?? d.stage.probability)) / 100, 0)),
        byStage,
        stale: deals.filter((d) => !d.lastActivityAt || d.lastActivityAt < staleBefore).map((d) => ({ id: d.id, name: d.name, company: d.company?.name, owner: d.owner?.name, lastActivityAt: d.lastActivityAt })),
        noNextStep: deals.filter((d) => !d.nextStep).map((d) => ({ id: d.id, name: d.name, company: d.company?.name, owner: d.owner?.name })),
        quotesWaiting: quotes.map((q) => ({ id: q.id, number: q.number, title: q.title, company: q.company?.name, status: q.status, total: Number(q.total), sentAt: q.sentAt, viewedAt: q.viewedAt })),
      };
    },
  },
  {
    name: "my_tasks",
    description: "The current person's open tasks, overdue first.",
    input_schema: { type: "object", properties: { includeDone: { type: "boolean" } } },
    scope: "read",
    async run(a, ctx) {
      const rows = await prisma.task.findMany({ where: { assigneeId: ctx.userId, ...(a.includeDone ? {} : { status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } }) }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 50, include: { contact: { select: { firstName: true, lastName: true } }, deal: { select: { name: true } }, company: { select: { name: true } } } });
      return rows.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, overdue: !!t.dueAt && t.dueAt < new Date(), priority: t.priority, status: t.status, type: t.taskType, about: t.contact ? fullName(t.contact) : t.deal?.name ?? t.company?.name ?? null }));
    },
  },
  {
    name: "create_task",
    description: "Create a task for the current person (or another team member by email). Use when the user asks to remind them or to schedule a follow up.",
    input_schema: { type: "object", properties: { title: str("Short task title"), dueAt: str("ISO date or datetime"), priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] }, taskType: str("email, call, follow_up, meeting, quote, survey, install, maintenance, onboarding or general"), contactId: str(""), companyId: str(""), dealId: str(""), assigneeEmail: str("Team member email; defaults to the current person"), description: str("") }, required: ["title"] },
    scope: "write",
    async run(a, ctx) {
      const assignee = a.assigneeEmail ? await prisma.user.findUnique({ where: { email: String(a.assigneeEmail).toLowerCase() }, select: { id: true } }) : null;
      const t = await prisma.task.create({ data: { title: s(a.title, 200)!, description: s(a.description, 5000), dueAt: a.dueAt ? new Date(String(a.dueAt)) : null, priority: (s(a.priority, 10) as "LOW" | "MEDIUM" | "HIGH" | "URGENT") ?? "MEDIUM", taskType: s(a.taskType, 40) ?? "general", assigneeId: assignee?.id ?? ctx.userId, createdById: ctx.userId, contactId: s(a.contactId, 60) || null, companyId: s(a.companyId, 60) || null, dealId: s(a.dealId, 60) || null, source: "assistant" } });
      return { created: true, id: t.id, title: t.title, dueAt: t.dueAt, link: `/hq/tasks?open=${t.id}` };
    },
  },
  {
    name: "log_note",
    description: "Log a note, call or meeting on a contact, company or deal timeline.",
    input_schema: { type: "object", properties: { body: str("The note text"), type: { type: "string", enum: ["NOTE", "CALL", "MEETING"] }, contactId: str(""), companyId: str(""), dealId: str("") }, required: ["body"] },
    scope: "write",
    async run(a, ctx) {
      const row = await logActivity({ type: (s(a.type, 10) as "NOTE" | "CALL" | "MEETING") ?? "NOTE", body: s(a.body, 5000), contactId: s(a.contactId, 60) || null, companyId: s(a.companyId, 60) || null, dealId: s(a.dealId, 60) || null, actorId: ctx.userId, source: "assistant" });
      return { logged: !!row, id: row?.id };
    },
  },
  {
    name: "search_sops",
    description: "Find the standard operating procedures, policies and playbooks that apply to a question. Returns titles, summaries and the most relevant passages. Always use this for how to, policy, pricing, demo, outreach or process questions and cite the SOP title in the answer.",
    input_schema: { type: "object", properties: { query: str("What the user is trying to do or asking about"), department: str("Optional department name") }, required: ["query"] },
    scope: "read",
    async run(a) {
      const q = (s(a.query, 200) ?? "").toLowerCase();
      const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      const sops = await prisma.sop.findMany({ where: { status: "PUBLISHED", ...(a.department ? { department: { name: like(String(a.department)) } } : {}) }, include: { department: { select: { name: true } } } });
      const scored = sops
        .map((sop) => {
          const hay = `${sop.title} ${sop.summary ?? ""} ${sop.keywords.join(" ")} ${sop.tags.join(" ")}`.toLowerCase();
          let score = 0;
          for (const w of words) {
            if (hay.includes(w)) score += 3;
            if (sop.body.toLowerCase().includes(w)) score += 1;
          }
          return { sop, score };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);
      return scored.map(({ sop }) => {
        const paras = sop.body.split(/\n{2,}/);
        const best = paras.map((p) => ({ p, sc: words.reduce((acc, w) => acc + (p.toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x) => x.sc > 0).sort((x, y) => y.sc - x.sc).slice(0, 3).map((x) => x.p.slice(0, 700));
        return { slug: sop.slug, code: sop.code, title: sop.title, department: sop.department?.name ?? "Company", category: sop.category, summary: sop.summary, passages: best, steps: sop.steps, link: `/hq/sops/${sop.slug}` };
      });
    },
  },
  {
    name: "get_sop",
    description: "Read one SOP in full by slug.",
    input_schema: { type: "object", properties: { slug: str("SOP slug from search_sops") }, required: ["slug"] },
    scope: "read",
    async run(a) {
      const sop = await prisma.sop.findUnique({ where: { slug: s(a.slug, 120) ?? "" }, include: { department: { select: { name: true } } } });
      if (!sop || sop.status !== "PUBLISHED") return { error: "Not found" };
      return { title: sop.title, code: sop.code, department: sop.department?.name ?? "Company", summary: sop.summary, body: sop.body.slice(0, 12000), steps: sop.steps, enforcedBySystem: sop.enforcedBySystem, link: `/hq/sops/${sop.slug}` };
    },
  },
  {
    name: "search_email",
    description: "Search the current person's own mailbox (synced cache, and live when a query is given). Returns matching messages with thread ids. Use for questions like who is waiting on me, what did X say, or find the email about Y.",
    input_schema: { type: "object", properties: { query: str("Words, a sender, or a subject"), days: num("How far back, default 30"), direction: { type: "string", enum: ["INBOUND", "OUTBOUND"] }, contactId: str("Only mail with this contact") } },
    scope: "read",
    async run(a, ctx) {
      const days = n(a.days, 30)!;
      const q = s(a.query, 120);
      const since = new Date(Date.now() - days * 86400000);
      const rows = await prisma.mailMessage.findMany({ where: { userId: ctx.userId, receivedAt: { gte: since }, ...(a.direction ? { direction: a.direction as "INBOUND" | "OUTBOUND" } : {}), ...(a.contactId ? { contactId: String(a.contactId) } : {}), ...(q ? { OR: [{ subject: like(q) }, { fromEmail: like(q) }, { fromName: like(q) }, { snippet: like(q) }, { bodyText: like(q) }] } : {}) }, orderBy: { receivedAt: "desc" }, take: 25, include: { contact: { select: { id: true, firstName: true, lastName: true } } } });
      let live: unknown[] = [];
      if (q && rows.length < 5) {
        const got = await getMailProvider(ctx.userId);
        if (got) {
          try {
            live = (await got.provider.listMessages({ folder: "inbox", query: q, top: 10, sinceDays: days })).map((m) => ({ threadId: m.threadId, id: m.id, subject: m.subject, from: m.from?.email, at: m.receivedAt, snippet: m.snippet }));
          } catch {
            live = [];
          }
        }
      }
      return { cached: rows.map((r) => ({ threadId: r.threadId ?? r.externalId, subject: r.subject, from: r.fromEmail, to: r.toEmails, at: r.receivedAt, direction: r.direction, snippet: r.snippet, contact: r.contact ? { id: r.contact.id, name: fullName(r.contact) } : null })), live };
    },
  },
  {
    name: "read_email_thread",
    description: "Read a full email thread from the current person's mailbox by thread id.",
    input_schema: { type: "object", properties: { threadId: str("Thread id from search_email") }, required: ["threadId"] },
    scope: "read",
    async run(a, ctx) {
      const got = await getMailProvider(ctx.userId);
      const threadId = s(a.threadId, 400) ?? "";
      if (got) {
        try {
          const msgs = await got.provider.getThread(threadId);
          return msgs.map((m) => ({ id: m.id, from: m.from?.email, to: m.to.map((t) => t.email), at: m.receivedAt, direction: m.direction, subject: m.subject, text: (m.bodyText ?? m.snippet ?? "").slice(0, 6000) }));
        } catch {
          /* fall through to cache */
        }
      }
      const rows = await prisma.mailMessage.findMany({ where: { userId: ctx.userId, threadId }, orderBy: { receivedAt: "asc" } });
      return rows.map((r) => ({ id: r.externalId, from: r.fromEmail, to: r.toEmails, at: r.receivedAt, direction: r.direction, subject: r.subject, text: r.bodyText ?? r.snippet }));
    },
  },
  {
    name: "email_stats",
    description: "Statistics about the current person's own mailbox: sent and received counts, who is waiting on a reply, median reply time, top correspondents.",
    input_schema: { type: "object", properties: { days: num("Window in days, default 30") } },
    scope: "read",
    async run(a, ctx) {
      return mailStats(ctx.userId, n(a.days, 30)!);
    },
  },
  {
    name: "calendar_events",
    description: "Upcoming events on the current person's own calendar.",
    input_schema: { type: "object", properties: { days: num("Days ahead, default 7") } },
    scope: "read",
    async run(a, ctx) {
      const got = await getMailProvider(ctx.userId);
      if (!got) return { error: "No calendar connected. Connect Microsoft 365 or Google from the Inbox page." };
      const days = n(a.days, 7)!;
      return got.provider.listEvents({ from: new Date().toISOString(), to: new Date(Date.now() + days * 86400000).toISOString() });
    },
  },
  {
    name: "create_calendar_event",
    description: "Create an event on the current person's own calendar, optionally with attendees and an online meeting link.",
    input_schema: { type: "object", properties: { title: str(""), start: str("ISO datetime"), end: str("ISO datetime"), attendees: { type: "array", items: { type: "string" }, description: "Attendee emails" }, location: str(""), description: str(""), onlineMeeting: { type: "boolean" } }, required: ["title", "start", "end"] },
    scope: "write",
    async run(a, ctx) {
      const got = await getMailProvider(ctx.userId);
      if (!got) return { error: "No calendar connected." };
      return got.provider.createEvent({ title: s(a.title, 200)!, start: String(a.start), end: String(a.end), attendees: (Array.isArray(a.attendees) ? (a.attendees as string[]) : []).map((e) => ({ email: e })), location: s(a.location, 200), description: s(a.description, 4000), onlineMeeting: !!a.onlineMeeting });
    },
  },
  {
    name: "catalog_search",
    description: "Search the product catalog (robots and accessories) with public prices: purchase price and monthly Robot as a Service price.",
    input_schema: { type: "object", properties: { query: str("Model, OEM or category"), category: str("") } },
    scope: "read",
    async run(a) {
      const q = s(a.query, 100);
      const rows = await prisma.product.findMany({ where: { published: true, ...(q ? { OR: [{ name: like(q) }, { oem: like(q) }, { category: like(q) }, { description: like(q) }] } : {}), ...(a.category ? { category: like(String(a.category)) } : {}) }, take: 15, orderBy: [{ sortOrder: "asc" }] });
      return rows.map((p) => ({ id: p.id, name: p.name, oem: p.oem, category: p.category, purchasePrice: p.purchasePrice ? `from ${money(Number(p.purchasePrice))}` : null, monthlyPrice: p.monthlyPrice ? `from ${money(Number(p.monthlyPrice))}/mo` : null, description: p.description?.slice(0, 300), specs: (p.specs as { specifications?: string } | null)?.specifications ?? null }));
    },
  },
  {
    name: "team_directory",
    description: "Find team members: name, title, department, email, phone, booking link.",
    input_schema: { type: "object", properties: { query: str("Name, role or department") } },
    scope: "read",
    async run(a) {
      const q = s(a.query, 100);
      const rows = await prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", ...(q ? { OR: [{ name: like(q) }, { title: like(q) }, { roleLabel: like(q) }, { department: { name: like(q) } }] } : {}) }, include: { department: { select: { name: true } } }, take: 30 });
      return rows.map((u) => ({ name: u.name, email: u.email, title: u.title, department: u.department?.name, tier: u.tier, phone: u.phone, bookingLink: u.bookingLink, territory: u.territory }));
    },
  },
  {
    name: "company_rules",
    description: "The company's current pricing language, offer rules and assistant rules from Settings. Use before quoting any price or offer.",
    input_schema: { type: "object", properties: {} },
    scope: "read",
    async run() {
      const [pricing, assistant, company, email] = await Promise.all([getSetting("pricingLanguage"), getSetting("assistant"), getSetting("company"), getSetting("email")]);
      return { pricing, rules: assistant.rules, company, outreach: { maxWords: email.maxOutreachWords, targetWords: email.targetOutreachWords } };
    },
  },
];

export function toolsForScopes(scopes: ToolScope[]): HqTool[] {
  return HQ_TOOLS.filter((t) => t.scope === "read" || scopes.includes(t.scope) || (t.scope === "write" && scopes.includes("write")));
}

export function findTool(name: string) {
  return HQ_TOOLS.find((t) => t.name === name);
}
