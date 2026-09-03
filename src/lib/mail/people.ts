import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { getMailProvider } from "@/lib/mail/provider";
import { syncMailbox } from "@/lib/mail/sync";
import { logActivity, notify } from "@/lib/audit";
import { assistantConfigured } from "@/lib/ai/run";
import { companyFromDomain, daysBetween, extractSignature, isAutomatedAddress, isBusinessDomain, relationshipScore, splitName } from "@/lib/mail/people-parse";
import type { MailContactStatus } from "@/generated/prisma/enums";

// Reads one person's mailbox cache and turns it into people: who they talk to, how often, when
// last, and what the signatures say about title, company and phone. Everything stays scoped to
// the mailbox owner. Promoting a person to a CRM contact is always an explicit click.

const OWN_DOMAINS = ["spectrumrobotics.ai"];

type Agg = {
  email: string;
  name: string | null;
  messagesIn: number;
  messagesOut: number;
  threads: Set<string>;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  lastSubject: string | null;
  lastThreadId: string | null;
  inboundMessageIds: string[]; // newest first, capped
};

export async function discoverPeople(userId: string, opts: { fetchBodies?: number } = {}): Promise<{ people: number; newPeople: number; enriched: number; linked: number }> {
  const conn = await prisma.connection.findFirst({ where: { userId, kind: "mail_calendar", status: "ACTIVE" }, select: { id: true, accountEmail: true } });
  const me = conn?.accountEmail?.toLowerCase() ?? "";
  const ownDomains = new Set([...OWN_DOMAINS, me.split("@")[1]].filter(Boolean));
  const rows = await prisma.mailMessage.findMany({
    where: { userId },
    orderBy: { receivedAt: "desc" },
    take: 6000,
    select: { id: true, threadId: true, externalId: true, fromEmail: true, fromName: true, toEmails: true, ccEmails: true, subject: true, receivedAt: true, direction: true, bodyText: true },
  });
  const agg = new Map<string, Agg>();
  const touch = (email: string, name: string | null, r: (typeof rows)[number], inbound: boolean) => {
    const key = email.toLowerCase().trim();
    if (!key || !key.includes("@") || key === me) return;
    const a = agg.get(key) ?? { email: key, name: null, messagesIn: 0, messagesOut: 0, threads: new Set<string>(), firstSeenAt: r.receivedAt, lastSeenAt: r.receivedAt, lastInboundAt: null, lastOutboundAt: null, lastSubject: null, lastThreadId: null, inboundMessageIds: [] };
    if (inbound) {
      a.messagesIn++;
      if (!a.lastInboundAt || r.receivedAt > a.lastInboundAt) a.lastInboundAt = r.receivedAt;
      if (a.inboundMessageIds.length < 4) a.inboundMessageIds.push(r.id); // rows arrive newest first
      if (name && !a.name) a.name = name;
    } else {
      a.messagesOut++;
      if (!a.lastOutboundAt || r.receivedAt > a.lastOutboundAt) a.lastOutboundAt = r.receivedAt;
    }
    a.threads.add(r.threadId ?? r.externalId);
    if (r.receivedAt < a.firstSeenAt) a.firstSeenAt = r.receivedAt;
    if (r.receivedAt >= a.lastSeenAt) { a.lastSeenAt = r.receivedAt; a.lastSubject = r.subject; a.lastThreadId = r.threadId ?? r.externalId; }
    agg.set(key, a);
  };
  for (const r of rows) {
    if (r.direction === "INBOUND") {
      if (r.fromEmail) touch(r.fromEmail, r.fromName, r, true);
    } else {
      for (const e of [...r.toEmails, ...r.ccEmails]) touch(e, null, r, false);
    }
  }
  if (!agg.size) return { people: 0, newPeople: 0, enriched: 0, linked: 0 };

  const emails = [...agg.keys()];
  const [existing, contacts] = await Promise.all([
    prisma.mailContact.findMany({ where: { userId, email: { in: emails } } }),
    prisma.contact.findMany({ where: { OR: [{ email: { in: emails, mode: "insensitive" } }, { emailSecondary: { in: emails, mode: "insensitive" } }] }, select: { id: true, email: true, emailSecondary: true, lastContactedAt: true, lastHeardFromAt: true } }),
  ]);
  const existingByEmail = new Map(existing.map((x) => [x.email, x]));
  const contactByEmail = new Map<string, (typeof contacts)[number]>();
  for (const c of contacts) {
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c);
    if (c.emailSecondary) contactByEmail.set(c.emailSecondary.toLowerCase(), c);
  }

  let newPeople = 0;
  let linked = 0;
  const toEnrich: { id: string; email: string; name: string | null; messageIds: string[] }[] = [];
  for (const a of agg.values()) {
    const domain = a.email.split("@")[1] ?? null;
    const internal = ownDomains.has(domain ?? "");
    const automated = !internal && isAutomatedAddress(a.email, a.name);
    const business = isBusinessDomain(domain);
    const contact = contactByEmail.get(a.email) ?? null;
    const prev = existingByEmail.get(a.email);
    let status: MailContactStatus = internal ? "INTERNAL" : automated ? "AUTOMATED" : contact ? "ADDED" : "NEW";
    if (prev && prev.status === "IGNORED" && status === "NEW") status = "IGNORED";
    if (prev && prev.status === "ADDED" && prev.contactId && !contact) status = "ADDED";
    const names = splitName(a.name, a.email);
    const score = relationshipScore({ messagesIn: a.messagesIn, messagesOut: a.messagesOut, threads: a.threads.size, lastSeenAt: a.lastSeenAt, business, automated, internal });
    const data = {
      name: a.name ?? prev?.name ?? names.display,
      firstName: prev?.firstName ?? names.firstName,
      lastName: prev?.lastName ?? names.lastName,
      domain,
      companyGuess: prev?.companyGuess ?? companyFromDomain(domain),
      messagesIn: a.messagesIn,
      messagesOut: a.messagesOut,
      threads: a.threads.size,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
      lastInboundAt: a.lastInboundAt,
      lastOutboundAt: a.lastOutboundAt,
      lastSubject: a.lastSubject?.slice(0, 200) ?? null,
      lastThreadId: a.lastThreadId,
      score,
      status,
      contactId: contact?.id ?? prev?.contactId ?? null,
    };
    let id: string;
    if (prev) {
      await prisma.mailContact.update({ where: { id: prev.id }, data });
      id = prev.id;
    } else {
      const row = await prisma.mailContact.create({ data: { userId, email: a.email, ...data } });
      id = row.id;
      if (status === "NEW") newPeople++;
    }
    if (contact && !prev?.contactId) linked++;
    // Read signatures for new people, and again for people still missing details once they write again.
    const stillBare = !!prev && !prev.jobTitle && !prev.phone && !prev.linkedinUrl;
    const wroteAgain = !!prev?.lastInboundAt && !!a.lastInboundAt && a.lastInboundAt > prev.lastInboundAt;
    if ((status === "NEW" || status === "ADDED") && a.messagesIn > 0 && (!prev?.enrichedAt || (stillBare && wroteAgain))) toEnrich.push({ id, email: a.email, name: a.name, messageIds: a.inboundMessageIds });

    // Keep the CRM contact's touch dates honest.
    if (contact) {
      const upd: { lastContactedAt?: Date; lastHeardFromAt?: Date } = {};
      if (a.lastOutboundAt && (!contact.lastContactedAt || a.lastOutboundAt > contact.lastContactedAt)) upd.lastContactedAt = a.lastOutboundAt;
      if (a.lastInboundAt && (!contact.lastHeardFromAt || a.lastInboundAt > contact.lastHeardFromAt)) upd.lastHeardFromAt = a.lastInboundAt;
      if (Object.keys(upd).length) await prisma.contact.update({ where: { id: contact.id }, data: upd });
    }
  }

  // Signatures: read the latest message each person sent. Fetch a bounded number of full bodies per run.
  let enriched = 0;
  let fetched = 0;
  const budget = opts.fetchBodies ?? 40;
  const provider = toEnrich.length ? await getMailProvider(userId).catch(() => null) : null;
  for (const p of toEnrich) {
    if (!p.messageIds.length) continue;
    // Walk their recent messages, newest first, until one carries a readable signature.
    let sig: ReturnType<typeof extractSignature> | null = null;
    for (const messageId of p.messageIds) {
      const msg = await prisma.mailMessage.findUnique({ where: { id: messageId }, select: { id: true, externalId: true, bodyText: true } });
      if (!msg) continue;
      let body = msg.bodyText;
      if (!body && provider && fetched < budget) {
        fetched++;
        try {
          const full = await provider.provider.getMessage(msg.externalId);
          body = full?.bodyText ?? null;
          if (body) await prisma.mailMessage.update({ where: { id: msg.id }, data: { bodyText: body.slice(0, 20000) } });
        } catch {
          body = null;
        }
      }
      if (!body) continue;
      const got = extractSignature(body, { name: p.name, email: p.email });
      if (!sig) sig = got;
      if (got.jobTitle || got.company || got.phone) { sig = got; break; }
    }
    if (!sig) continue;
    await prisma.mailContact.update({
      where: { id: p.id },
      data: {
        enrichedAt: new Date(),
        ...(sig.phone ? { phone: sig.phone } : {}),
        ...(sig.jobTitle ? { jobTitle: sig.jobTitle } : {}),
        ...(sig.company ? { companyGuess: sig.company } : {}),
        ...(sig.linkedinUrl ? { linkedinUrl: sig.linkedinUrl } : {}),
        ...(sig.signature ? { signature: sig.signature } : {}),
      },
    });
    if (sig.phone || sig.jobTitle || sig.company) enriched++;
  }
  return { people: agg.size, newPeople, enriched, linked };
}

// Optional pass with the assistant for signatures the rules could not read. Bounded and best effort.
export async function enrichPeopleWithAssistant(userId: string, limit = 25): Promise<{ updated: number; skipped: number }> {
  if (!assistantConfigured()) return { updated: 0, skipped: 0 };
  const rows = await prisma.mailContact.findMany({
    where: { userId, status: { in: ["NEW", "ADDED"] }, signature: { not: null }, OR: [{ jobTitle: null }, { companyGuess: null }, { phone: null }] },
    orderBy: { score: "desc" },
    take: limit,
    select: { id: true, email: true, name: true, signature: true },
  });
  if (!rows.length) return { updated: 0, skipped: 0 };
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const model = (await getSetting("assistant")).model || "claude-opus-5";
  const input = rows.map((r) => ({ id: r.id, email: r.email, name: r.name, signature: r.signature }));
  const response = await client.beta.messages.create({
    model,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: "You read email signature blocks and return the person's job title, company name, best phone number and LinkedIn URL. Only report what is clearly in the text. Never guess.",
    tools: [
      {
        name: "record_people",
        description: "Record the details read from each signature.",
        input_schema: {
          type: "object",
          properties: {
            people: {
              type: "array",
              items: { type: "object", properties: { id: { type: "string" }, jobTitle: { type: "string" }, company: { type: "string" }, phone: { type: "string" }, linkedinUrl: { type: "string" } }, required: ["id"] },
            },
          },
          required: ["people"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "record_people" },
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  const call = response.content.find((b) => b.type === "tool_use");
  if (!call || call.type !== "tool_use") return { updated: 0, skipped: rows.length };
  const people = ((call.input as { people?: { id: string; jobTitle?: string; company?: string; phone?: string; linkedinUrl?: string }[] }).people ?? []).filter((p) => rows.some((r) => r.id === p.id));
  let updated = 0;
  for (const p of people) {
    const data: Record<string, string | Date> = { enrichedAt: new Date() };
    if (p.jobTitle?.trim()) data.jobTitle = p.jobTitle.trim().slice(0, 120);
    if (p.company?.trim()) data.companyGuess = p.company.trim().slice(0, 120);
    if (p.phone?.trim()) data.phone = p.phone.trim().slice(0, 40);
    if (p.linkedinUrl?.trim()) data.linkedinUrl = p.linkedinUrl.trim().slice(0, 200);
    if (Object.keys(data).length > 1) {
      await prisma.mailContact.update({ where: { id: p.id }, data });
      updated++;
    }
  }
  return { updated, skipped: rows.length - updated };
}

export type FollowUpKind = "needs_reply" | "waiting_on_them" | "gone_quiet" | "quiet_lead";
export type FollowUp = {
  kind: FollowUpKind;
  key: string;
  email: string;
  name: string;
  company: string | null;
  jobTitle: string | null;
  contactId: string | null;
  mailContactId: string | null;
  threadId: string | null;
  subject: string | null;
  lastAt: string;
  days: number;
  exchanges: number;
  score: number;
  reason: string;
  taskId: string | null;
};
export type FollowUpSet = { needsReply: FollowUp[]; waitingOnThem: FollowUp[]; goneQuiet: FollowUp[]; quietLeads: FollowUp[]; settings: { replyWithinDays: number; waitingOnThemDays: number; quietDays: number; leadMinExchanges: number } };

export async function followUpSuggestions(userId: string): Promise<FollowUpSet> {
  const cfg = await getSetting("followUp");
  const now = new Date();
  const since = new Date(now.getTime() - 120 * 86400000);
  const [rows, people, openTasks] = await Promise.all([
    prisma.mailMessage.findMany({ where: { userId, receivedAt: { gte: since } }, orderBy: { receivedAt: "asc" }, select: { threadId: true, externalId: true, subject: true, fromEmail: true, toEmails: true, receivedAt: true, direction: true } }),
    prisma.mailContact.findMany({ where: { userId }, include: { contact: { select: { id: true, firstName: true, lastName: true, jobTitle: true, company: { select: { name: true } }, companyName: true } } } }),
    prisma.task.findMany({ where: { assigneeId: userId, status: { in: ["TODO", "IN_PROGRESS"] }, tags: { hasSome: ["mail-follow-up"] } }, select: { id: true, tags: true } }),
  ]);
  const byEmail = new Map(people.map((p) => [p.email, p]));
  const taskByKey = new Map<string, string>();
  for (const t of openTasks) for (const tag of t.tags) if (tag.startsWith("mail:")) taskByKey.set(tag, t.id);
  const describe = (p: (typeof people)[number]) => ({
    email: p.email,
    name: p.contact ? [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") : p.name ?? p.email,
    company: p.contact?.company?.name ?? p.contact?.companyName ?? p.companyGuess ?? null,
    jobTitle: p.contact?.jobTitle ?? p.jobTitle ?? null,
    contactId: p.contactId,
    mailContactId: p.id,
    exchanges: Math.min(p.messagesIn, p.messagesOut),
    score: p.score,
  });
  const relevant = (p: (typeof people)[number] | undefined) => !!p && (p.status === "NEW" || p.status === "ADDED");

  const threads = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.threadId ?? r.externalId;
    threads.set(k, [...(threads.get(k) ?? []), r]);
  }
  const needsReply: FollowUp[] = [];
  const waitingOnThem: FollowUp[] = [];
  for (const [threadId, msgs] of threads) {
    const last = msgs[msgs.length - 1];
    const days = daysBetween(now, last.receivedAt);
    if (last.direction === "INBOUND") {
      const p = last.fromEmail ? byEmail.get(last.fromEmail.toLowerCase()) : undefined;
      if (!relevant(p) || days < cfg.replyWithinDays) continue;
      const key = `mail:thread:${threadId}`;
      needsReply.push({ kind: "needs_reply", key, ...describe(p!), threadId, subject: last.subject, lastAt: last.receivedAt.toISOString(), days, reason: `${describe(p!).name} wrote ${days} day${days === 1 ? "" : "s"} ago and has not heard back.`, taskId: taskByKey.get(key) ?? null });
    } else {
      const to = last.toEmails[0]?.toLowerCase();
      const p = to ? byEmail.get(to) : undefined;
      if (!relevant(p) || days < cfg.waitingOnThemDays) continue;
      const theyWrote = msgs.some((m) => m.direction === "INBOUND") || (p!.messagesIn > 0);
      if (!theyWrote) continue;
      const key = `mail:thread:${threadId}`;
      waitingOnThem.push({ kind: "waiting_on_them", key, ...describe(p!), threadId, subject: last.subject, lastAt: last.receivedAt.toISOString(), days, reason: `You wrote ${days} day${days === 1 ? "" : "s"} ago. No reply yet.`, taskId: taskByKey.get(key) ?? null });
    }
  }

  const goneQuiet: FollowUp[] = [];
  const quietLeads: FollowUp[] = [];
  for (const p of people) {
    if (!relevant(p) || !p.lastSeenAt) continue;
    const days = daysBetween(now, p.lastSeenAt);
    const twoWay = Math.min(p.messagesIn, p.messagesOut);
    const base = describe(p);
    if (p.status === "ADDED" && twoWay >= 1 && days >= cfg.quietDays) {
      const key = `mail:quiet:${p.email}`;
      goneQuiet.push({ kind: "gone_quiet", key, ...base, threadId: p.lastThreadId, subject: p.lastSubject, lastAt: p.lastSeenAt.toISOString(), days, reason: `In the CRM, ${twoWay} two way exchange${twoWay === 1 ? "" : "s"}, nothing in ${days} days.`, taskId: taskByKey.get(key) ?? null });
    }
    if (p.status === "NEW" && isBusinessDomain(p.domain) && twoWay >= cfg.leadMinExchanges) {
      const key = `mail:lead:${p.email}`;
      quietLeads.push({ kind: "quiet_lead", key, ...base, threadId: p.lastThreadId, subject: p.lastSubject, lastAt: p.lastSeenAt.toISOString(), days, reason: `${twoWay} two way exchange${twoWay === 1 ? "" : "s"} with ${base.company ?? p.domain}, not in the CRM yet.`, taskId: taskByKey.get(key) ?? null });
    }
  }
  const byRecent = (a: FollowUp, b: FollowUp) => b.lastAt.localeCompare(a.lastAt);
  const byScore = (a: FollowUp, b: FollowUp) => b.score - a.score || byRecent(a, b);
  const onePerPerson = (items: FollowUp[]) => {
    const seen = new Set<string>();
    return items.sort(byRecent).filter((x) => (seen.has(x.email) ? false : (seen.add(x.email), true)));
  };
  const needs = onePerPerson(needsReply);
  const waiting = onePerPerson(waitingOnThem).filter((x) => !needs.some((n) => n.email === x.email));
  return {
    needsReply: needs.slice(0, 50),
    waitingOnThem: waiting.slice(0, 50),
    goneQuiet: goneQuiet.sort(byScore).slice(0, 50),
    quietLeads: quietLeads.sort(byScore).slice(0, 50),
    settings: { replyWithinDays: cfg.replyWithinDays, waitingOnThemDays: cfg.waitingOnThemDays, quietDays: cfg.quietDays, leadMinExchanges: cfg.leadMinExchanges },
  };
}

const TASK_TITLES: Record<FollowUpKind, (name: string) => string> = {
  needs_reply: (n) => `Reply to ${n}`,
  waiting_on_them: (n) => `Follow up with ${n}, no reply yet`,
  gone_quiet: (n) => `Check in with ${n}, it has gone quiet`,
  quiet_lead: (n) => `Possible lead: reach out to ${n}`,
};

// Creates one follow up task per item, skipping any that already have an open task. Returns the ids.
export async function createFollowUpTasks(userId: string, items: FollowUp[], actorId: string | null = userId): Promise<{ created: number; existing: number; ids: string[] }> {
  let created = 0;
  let existing = 0;
  const ids: string[] = [];
  for (const it of items) {
    const dup = await prisma.task.findFirst({ where: { assigneeId: userId, status: { in: ["TODO", "IN_PROGRESS"] }, tags: { has: it.key } }, select: { id: true } });
    if (dup) { existing++; ids.push(dup.id); continue; }
    const due = new Date();
    due.setHours(17, 0, 0, 0);
    if (it.kind === "gone_quiet" || it.kind === "quiet_lead") due.setDate(due.getDate() + 2);
    const task = await prisma.task.create({
      data: {
        title: TASK_TITLES[it.kind](it.name),
        description: [it.reason, it.subject ? `Last subject: ${it.subject}` : null, `Email: ${it.email}`].filter(Boolean).join("\n"),
        taskType: it.kind === "needs_reply" ? "email" : "follow_up",
        priority: it.kind === "needs_reply" ? "HIGH" : "MEDIUM",
        dueAt: due,
        assigneeId: userId,
        createdById: actorId,
        contactId: it.contactId,
        tags: ["mail-follow-up", it.key],
        source: "email",
      },
    });
    ids.push(task.id);
    created++;
    if (it.contactId) await logActivity({ type: "SYSTEM", subject: `Follow up task created: ${task.title}`, contactId: it.contactId, actorId, source: "system", metadata: { taskId: task.id, kind: it.kind } });
  }
  return { created, existing, ids };
}

// Nightly pass for every connected mailbox: pull new mail, refresh people, and (when switched on)
// create the follow up tasks and a heads up about new possible leads.
export async function syncAllMailboxes(): Promise<{ mailboxes: number; synced: number; tasks: number; errors: string[] }> {
  const cfg = await getSetting("followUp");
  const conns = await prisma.connection.findMany({ where: { kind: "mail_calendar", status: "ACTIVE", userId: { not: null } }, select: { userId: true, accountEmail: true } });
  const out = { mailboxes: conns.length, synced: 0, tasks: 0, errors: [] as string[] };
  for (const c of conns) {
    const userId = c.userId!;
    try {
      const r = await syncMailbox(userId, { days: 7, top: 100 });
      if (!r.ok) { out.errors.push(`${c.accountEmail}: ${r.error}`); continue; }
      out.synced++;
      await discoverPeople(userId, { fetchBodies: 20 });
      if (!cfg.autoTasks) continue;
      const f = await followUpSuggestions(userId);
      const todo = [...f.needsReply, ...f.waitingOnThem].filter((x) => !x.taskId);
      if (todo.length) {
        const made = await createFollowUpTasks(userId, todo.slice(0, 20), null);
        out.tasks += made.created;
      }
      const leads = f.quietLeads.filter((x) => !x.taskId);
      if (leads.length) {
        const weekAgo = new Date(Date.now() - 7 * 86400000);
        const recent = await prisma.notification.findFirst({ where: { userId, type: "mail_leads", createdAt: { gte: weekAgo } }, select: { id: true } });
        if (!recent) await notify({ userId, type: "mail_leads", title: `${leads.length} possible lead${leads.length === 1 ? "" : "s"} found in your mailbox`, body: leads.slice(0, 3).map((l) => l.name).join(", ") + (leads.length > 3 ? " and more" : ""), link: "/hq/inbox/people?tab=leads" });
      }
    } catch (e) {
      out.errors.push(`${c.accountEmail}: ${(e as Error).message}`);
    }
  }
  return out;
}
