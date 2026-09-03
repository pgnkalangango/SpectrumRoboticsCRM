"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { getMailProvider } from "@/lib/mail/provider";
import { syncMailbox } from "@/lib/mail/sync";
import { getSetting } from "@/lib/settings";
import { logActivity, audit } from "@/lib/audit";
import type { CalendarEventDto, MailMessageDto } from "@/lib/mail/types";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  return { ok: false, error: (e as Error)?.message || "Something went wrong." };
}

export async function syncNow(days = 30): Promise<Result<{ synced: number; matched: number }>> {
  try {
    const user = await actionStaff();
    const r = await syncMailbox(user.id, { days });
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath("/hq/inbox");
    return { ok: true, data: { synced: r.synced, matched: r.matched } };
  } catch (e) {
    return fail(e);
  }
}

export async function getThreadMessages(threadId: string): Promise<Result<MailMessageDto[]>> {
  try {
    const user = await actionStaff();
    const got = await getMailProvider(user.id);
    if (!got) return { ok: false, error: "No mailbox connected." };
    try {
      const msgs = await got.provider.getThread(threadId);
      return { ok: true, data: msgs };
    } catch {
      // Fall back to the cache when the provider is unreachable.
      const rows = await prisma.mailMessage.findMany({ where: { userId: user.id, threadId }, orderBy: { receivedAt: "asc" } });
      return {
        ok: true,
        data: rows.map((r) => ({ id: r.externalId, threadId: r.threadId, subject: r.subject, from: r.fromEmail ? { email: r.fromEmail, name: r.fromName } : null, to: r.toEmails.map((e) => ({ email: e })), cc: r.ccEmails.map((e) => ({ email: e })), snippet: r.snippet, bodyText: r.bodyText, receivedAt: r.receivedAt.toISOString(), isRead: r.isRead, hasAttachments: r.hasAttachments, webLink: r.webLink, direction: r.direction as "INBOUND" | "OUTBOUND" })),
      };
    }
  } catch (e) {
    return fail(e);
  }
}

const sendSchema = z.object({
  to: z.array(z.string().email()).min(1, "Add at least one recipient."),
  cc: z.array(z.string().email()).optional(),
  subject: z.string().min(1, "Add a subject.").max(300),
  body: z.string().min(1, "Write the message first.").max(50000),
  replyToExternalId: z.string().optional().nullable(),
  threadId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
});

// Sends from the person's own mailbox with their signature and the company footer. Honors do not contact.
export async function sendMailFromInbox(input: z.input<typeof sendSchema>): Promise<Result<{ id: string | null }>> {
  try {
    const user = await actionStaff();
    const d = sendSchema.parse(input);
    const got = await getMailProvider(user.id);
    if (!got) return { ok: false, error: "Connect your mailbox first." };
    const blocked = await prisma.contact.findFirst({ where: { OR: [{ email: { in: d.to } }, { emailSecondary: { in: d.to } }], doNotContact: true }, select: { firstName: true, lastName: true } });
    if (blocked) return { ok: false, error: `${blocked.firstName} ${blocked.lastName ?? ""} asked not to be contacted. The message was not sent.` };
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, title: true, phone: true, bookingLink: true, signatureHtml: true } });
    const email = await getSetting("email");
    const company = await getSetting("company");
    const signature = me?.signatureHtml?.trim() || `<p>${me?.name}${me?.title ? `<br/>${me.title}` : ""}<br/>${company.name}${me?.phone ? ` · ${me.phone}` : ""}${me?.bookingLink ? `<br/><a href="${me.bookingLink}">Book a time with me</a>` : ""}</p>`;
    const bodyHtml = d.body.includes("<") && d.body.includes(">") ? d.body : d.body.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
    const html = `<div style="font-family:Segoe UI,system-ui,sans-serif;font-size:15px;line-height:1.5">${bodyHtml}<br/>${signature}${email.footerHtml}</div>`;
    const res = await got.provider.sendMail({ to: d.to.map((e) => ({ email: e })), cc: (d.cc ?? []).map((e) => ({ email: e })), subject: d.subject, html, replyTo: d.replyToExternalId ? { externalId: d.replyToExternalId, threadId: d.threadId } : null });
    const contact = d.contactId ? await prisma.contact.findUnique({ where: { id: d.contactId } }) : await prisma.contact.findFirst({ where: { OR: [{ email: { in: d.to } }, { emailSecondary: { in: d.to } }] } });
    await logActivity({ type: "EMAIL_OUT", subject: d.subject, body: d.body.replace(/<[^>]+>/g, "").slice(0, 2000), contactId: contact?.id, companyId: contact?.companyId, dealId: d.dealId, actorId: user.id, source: got.conn.provider === "MICROSOFT" ? "outlook" : "gmail", direction: "OUTBOUND", participants: d.to, externalId: res.id ? `mail:${got.conn.id}:${res.id}` : undefined });
    revalidatePath("/hq/inbox");
    return { ok: true, data: { id: res.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function createContactFromSender(input: { email: string; name?: string | null; threadId?: string | null }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const email = input.email.toLowerCase();
    const existing = await prisma.contact.findFirst({ where: { OR: [{ email }, { emailSecondary: email }] } });
    if (existing) return { ok: true, data: { id: existing.id } };
    const parts = (input.name ?? email.split("@")[0]).split(/\s+/);
    const domain = email.split("@")[1];
    const company = domain ? await prisma.company.findFirst({ where: { domain: { equals: domain, mode: "insensitive" } } }) : null;
    const c = await prisma.contact.create({ data: { firstName: parts[0], lastName: parts.slice(1).join(" ") || null, email, companyId: company?.id, companyName: company?.name, leadSource: "email", type: "LEAD", ownerId: user.id } });
    if (input.threadId) {
      await prisma.mailMessage.updateMany({ where: { userId: user.id, threadId: input.threadId }, data: { contactId: c.id } });
    }
    await logActivity({ type: "SYSTEM", subject: "Contact created from email", contactId: c.id, companyId: company?.id, actorId: user.id, source: "system" });
    revalidatePath("/hq/inbox");
    return { ok: true, data: { id: c.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function upcomingEvents(days = 7): Promise<Result<CalendarEventDto[]>> {
  try {
    const user = await actionStaff();
    const got = await getMailProvider(user.id);
    if (!got) return { ok: true, data: [] };
    const from = new Date();
    const to = new Date(Date.now() + days * 86400000);
    const events = await got.provider.listEvents({ from: from.toISOString(), to: to.toISOString() });
    return { ok: true, data: events };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectMailbox(): Promise<Result> {
  try {
    const user = await actionStaff();
    await prisma.connection.deleteMany({ where: { userId: user.id, kind: "mail_calendar" } });
    await audit({ actorId: user.id, action: "disconnect_mailbox", entityType: "Connection" });
    revalidatePath("/hq/inbox");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markThreadRead(threadId: string): Promise<Result> {
  try {
    const user = await actionStaff();
    await prisma.mailMessage.updateMany({ where: { userId: user.id, threadId }, data: { isRead: true } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
