import { prisma } from "@/lib/prisma";
import { getMailProvider } from "@/lib/mail/provider";
import type { MailMessageDto } from "@/lib/mail/types";
import { logActivity } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

// Pulls the last N days of inbox and sent mail into the MailMessage cache for one person, matches
// senders and recipients to contacts, and writes email activities on the contact timeline.
export async function syncMailbox(userId: string, opts: { days?: number; top?: number } = {}) {
  const got = await getMailProvider(userId);
  if (!got) return { ok: false as const, error: "No mailbox connected." };
  const { conn, provider } = got;
  // First sync after connecting reads the configured history so the people list is complete.
  // After that only recent mail is pulled.
  const firstSync = !conn.lastSyncAt;
  const history = firstSync ? (await getSetting("followUp")).historyDays : null;
  const days = history ?? opts.days ?? 30;
  const top = firstSync ? 500 : (opts.top ?? 60);
  const me = conn.accountEmail?.toLowerCase() ?? "";
  let inbox: MailMessageDto[] = [];
  let sent: MailMessageDto[] = [];
  try {
    [inbox, sent] = await Promise.all([provider.listMessages({ folder: "inbox", sinceDays: days, top }), provider.listMessages({ folder: "sent", sinceDays: days, top })]);
  } catch (e) {
    await prisma.connection.update({ where: { id: conn.id }, data: { lastError: (e as Error).message } }).catch(() => null);
    return { ok: false as const, error: (e as Error).message };
  }
  const all = [...inbox, ...sent];
  const emails = new Set<string>();
  for (const m of all) {
    if (m.from?.email && m.from.email !== me) emails.add(m.from.email);
    for (const t of [...m.to, ...m.cc]) if (t.email !== me) emails.add(t.email);
  }
  const contacts = emails.size ? await prisma.contact.findMany({ where: { OR: [{ email: { in: [...emails] } }, { emailSecondary: { in: [...emails] } }] }, select: { id: true, email: true, emailSecondary: true, companyId: true } }) : [];
  const byEmail = new Map<string, { id: string; companyId: string | null }>();
  for (const c of contacts) {
    if (c.email) byEmail.set(c.email.toLowerCase(), { id: c.id, companyId: c.companyId });
    if (c.emailSecondary) byEmail.set(c.emailSecondary.toLowerCase(), { id: c.id, companyId: c.companyId });
  }

  let created = 0;
  let matched = 0;
  for (const m of all) {
    const counterpart = m.direction === "INBOUND" ? m.from?.email : [...m.to, ...m.cc].map((t) => t.email).find((e) => byEmail.has(e)) ?? m.to[0]?.email;
    const contact = counterpart ? byEmail.get(counterpart) ?? null : null;
    const row = await prisma.mailMessage.upsert({
      where: { connectionId_externalId: { connectionId: conn.id, externalId: m.id } },
      create: {
        connectionId: conn.id,
        userId,
        externalId: m.id,
        threadId: m.threadId,
        fromEmail: m.from?.email ?? null,
        fromName: m.from?.name ?? null,
        toEmails: m.to.map((t) => t.email),
        ccEmails: m.cc.map((t) => t.email),
        subject: m.subject,
        snippet: m.snippet?.slice(0, 500) ?? null,
        bodyText: m.bodyText?.slice(0, 20000) ?? null,
        receivedAt: new Date(m.receivedAt),
        direction: m.direction,
        isRead: m.isRead,
        hasAttachments: m.hasAttachments,
        folder: m.direction === "INBOUND" ? "inbox" : "sent",
        webLink: m.webLink,
        contactId: contact?.id ?? null,
      },
      update: { isRead: m.isRead, contactId: contact?.id ?? undefined, subject: m.subject, snippet: m.snippet?.slice(0, 500) ?? undefined },
    });
    created++;
    if (contact) {
      matched++;
      const externalId = `mail:${conn.id}:${m.id}`;
      const exists = await prisma.activity.findFirst({ where: { externalId }, select: { id: true } });
      if (!exists) {
        await logActivity({
          type: m.direction === "INBOUND" ? "EMAIL_IN" : "EMAIL_OUT",
          subject: m.subject ?? "(no subject)",
          body: m.snippet ?? undefined,
          contactId: contact.id,
          companyId: contact.companyId,
          actorId: userId,
          occurredAt: new Date(m.receivedAt),
          source: conn.provider === "MICROSOFT" ? "outlook" : "gmail",
          externalId,
          externalUrl: m.webLink,
          direction: m.direction,
          participants: [m.from?.email, ...m.to.map((t) => t.email)].filter((x): x is string => !!x),
          metadata: { mailMessageId: row.id, threadId: m.threadId },
        });
      }
    }
  }
  await prisma.connection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null, status: "ACTIVE" } });
  return { ok: true as const, synced: created, matched };
}

export type MailStats = {
  days: number;
  sent: number;
  received: number;
  correspondents: number;
  awaitingMyReply: { threadId: string; subject: string | null; from: string | null; receivedAt: string; contactId: string | null }[];
  medianReplyHours: number | null;
  repliedThreads: number;
  topCorrespondents: { email: string; name: string | null; count: number; contactId: string | null }[];
};

export async function mailStats(userId: string, days = 30): Promise<MailStats> {
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.mailMessage.findMany({ where: { userId, receivedAt: { gte: since } }, orderBy: { receivedAt: "asc" }, select: { threadId: true, subject: true, fromEmail: true, fromName: true, toEmails: true, receivedAt: true, direction: true, contactId: true } });
  const sent = rows.filter((r) => r.direction === "OUTBOUND").length;
  const received = rows.length - sent;
  const people = new Map<string, { name: string | null; count: number; contactId: string | null }>();
  for (const r of rows) {
    const key = r.direction === "INBOUND" ? r.fromEmail : r.toEmails[0];
    if (!key) continue;
    const p = people.get(key) ?? { name: r.direction === "INBOUND" ? r.fromName : null, count: 0, contactId: r.contactId };
    p.count++;
    if (!p.contactId && r.contactId) p.contactId = r.contactId;
    people.set(key, p);
  }
  const threads = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.threadId ?? `${r.subject}`;
    threads.set(k, [...(threads.get(k) ?? []), r]);
  }
  const awaiting: MailStats["awaitingMyReply"] = [];
  const deltas: number[] = [];
  let replied = 0;
  for (const [threadId, msgs] of threads) {
    const last = msgs[msgs.length - 1];
    if (last.direction === "INBOUND") awaiting.push({ threadId, subject: last.subject, from: last.fromName ?? last.fromEmail, receivedAt: last.receivedAt.toISOString(), contactId: last.contactId });
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].direction === "INBOUND" && msgs[i + 1].direction === "OUTBOUND") {
        deltas.push((msgs[i + 1].receivedAt.getTime() - msgs[i].receivedAt.getTime()) / 3600000);
        replied++;
        break;
      }
    }
  }
  deltas.sort((a, b) => a - b);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : null;
  return {
    days,
    sent,
    received,
    correspondents: people.size,
    awaitingMyReply: awaiting.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 25),
    medianReplyHours: median === null ? null : Math.round(median * 10) / 10,
    repliedThreads: replied,
    topCorrespondents: [...people.entries()].map(([email, p]) => ({ email, ...p })).sort((a, b) => b.count - a.count).slice(0, 10),
  };
}
