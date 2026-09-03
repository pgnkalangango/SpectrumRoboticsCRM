"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { logActivity } from "@/lib/audit";
import { syncMailbox } from "@/lib/mail/sync";
import { createFollowUpTasks, discoverPeople, enrichPeopleWithAssistant, followUpSuggestions, type FollowUp } from "@/lib/mail/people";
import { splitName } from "@/lib/mail/people-parse";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  return { ok: false, error: (e as Error)?.message || "Something went wrong." };
}
const paths = () => ["/hq/inbox/people", "/hq/inbox", "/hq/contacts", "/hq/tasks", "/hq"].forEach((p) => revalidatePath(p));

// Pull new mail, then rebuild the people list from the cache.
export async function refreshPeople(opts: { sync?: boolean } = {}): Promise<Result<{ people: number; newPeople: number; enriched: number; synced: number }>> {
  try {
    const user = await actionStaff();
    let synced = 0;
    if (opts.sync !== false) {
      const r = await syncMailbox(user.id, { days: 30 });
      if (!r.ok) return { ok: false, error: r.error };
      synced = r.synced;
    }
    const d = await discoverPeople(user.id);
    paths();
    return { ok: true, data: { ...d, synced } };
  } catch (e) {
    return fail(e);
  }
}

export async function improvePeopleDetails(): Promise<Result<{ updated: number; skipped: number }>> {
  try {
    const user = await actionStaff();
    const r = await enrichPeopleWithAssistant(user.id, 25);
    paths();
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

const addSchema = z.object({
  id: z.string(),
  firstName: z.string().min(1, "First name is needed.").max(80).optional(),
  lastName: z.string().max(80).optional().nullable(),
  jobTitle: z.string().max(120).optional().nullable(),
  companyName: z.string().max(120).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  type: z.enum(["LEAD", "PROSPECT", "CLIENT", "PARTNER", "VENDOR", "OTHER"]).optional(),
});
export type AddPersonInput = z.input<typeof addSchema>;

// Promote one mailbox person to a CRM contact. Links an existing contact with the same email instead of duplicating.
export async function addPersonToCrm(input: AddPersonInput): Promise<Result<{ contactId: string; created: boolean }>> {
  try {
    const user = await actionStaff();
    const d = addSchema.parse(input);
    const p = await prisma.mailContact.findUnique({ where: { id: d.id } });
    if (!p || p.userId !== user.id) throw new AccessDenied("That person is not in your mailbox list.");
    const email = p.email.toLowerCase();
    const existing = await prisma.contact.findFirst({ where: { OR: [{ email: { equals: email, mode: "insensitive" } }, { emailSecondary: { equals: email, mode: "insensitive" } }] }, select: { id: true } });
    if (existing) {
      await prisma.mailContact.update({ where: { id: p.id }, data: { status: "ADDED", contactId: existing.id } });
      await prisma.mailMessage.updateMany({ where: { userId: user.id, OR: [{ fromEmail: email }, { toEmails: { has: email } }], contactId: null }, data: { contactId: existing.id } });
      paths();
      return { ok: true, data: { contactId: existing.id, created: false } };
    }
    const names = splitName(p.name, p.email);
    const companyName = (d.companyName ?? p.companyGuess)?.trim() || null;
    const domain = p.domain;
    let company = domain ? await prisma.company.findFirst({ where: { domain: { equals: domain, mode: "insensitive" } }, select: { id: true, name: true } }) : null;
    if (!company && companyName) company = await prisma.company.findFirst({ where: { name: { equals: companyName, mode: "insensitive" } }, select: { id: true, name: true } });
    const contact = await prisma.contact.create({
      data: {
        firstName: (d.firstName ?? p.firstName ?? names.firstName).trim(),
        lastName: (d.lastName === undefined ? (p.lastName ?? names.lastName) : d.lastName)?.trim() || null,
        email,
        phoneMobile: (d.phone === undefined ? p.phone : d.phone)?.trim() || null,
        jobTitle: (d.jobTitle === undefined ? p.jobTitle : d.jobTitle)?.trim() || null,
        companyId: company?.id ?? null,
        companyName: company?.name ?? companyName,
        linkedinUrl: p.linkedinUrl,
        type: d.type ?? "LEAD",
        leadSource: "email",
        ownerId: user.id,
        lastContactedAt: p.lastOutboundAt,
        lastHeardFromAt: p.lastInboundAt,
        notes: p.signature ? `From their email signature:\n${p.signature}` : null,
      },
    });
    await prisma.mailContact.update({ where: { id: p.id }, data: { status: "ADDED", contactId: contact.id } });
    await prisma.mailMessage.updateMany({ where: { userId: user.id, OR: [{ fromEmail: email }, { toEmails: { has: email } }], contactId: null }, data: { contactId: contact.id } });
    await logActivity({ type: "SYSTEM", subject: `Added from ${user.name.split(" ")[0]}'s mailbox`, body: `${p.messagesIn} received, ${p.messagesOut} sent, ${p.threads} conversation${p.threads === 1 ? "" : "s"}.`, contactId: contact.id, companyId: company?.id ?? null, actorId: user.id, source: "system" });
    paths();
    return { ok: true, data: { contactId: contact.id, created: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function addPeopleToCrm(ids: string[]): Promise<Result<{ added: number; linked: number }>> {
  try {
    await actionStaff();
    let added = 0;
    let linked = 0;
    for (const id of ids.slice(0, 200)) {
      const r = await addPersonToCrm({ id });
      if (r.ok && r.data) { if (r.data.created) added++; else linked++; }
    }
    return { ok: true, data: { added, linked } };
  } catch (e) {
    return fail(e);
  }
}

export async function setPersonStatus(id: string, status: "NEW" | "IGNORED"): Promise<Result> {
  try {
    const user = await actionStaff();
    const p = await prisma.mailContact.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!p || p.userId !== user.id) throw new AccessDenied("That person is not in your mailbox list.");
    if (p.status === "ADDED") return { ok: false, error: "This person is already in the CRM. Archive the contact instead." };
    await prisma.mailContact.update({ where: { id }, data: { status } });
    paths();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function ignorePeople(ids: string[]): Promise<Result<{ count: number }>> {
  try {
    const user = await actionStaff();
    const r = await prisma.mailContact.updateMany({ where: { id: { in: ids.slice(0, 500) }, userId: user.id, status: "NEW" }, data: { status: "IGNORED" } });
    paths();
    return { ok: true, data: { count: r.count } };
  } catch (e) {
    return fail(e);
  }
}

export async function getFollowUps() {
  try {
    const user = await actionStaff();
    return { ok: true as const, data: await followUpSuggestions(user.id) };
  } catch (e) {
    return fail(e);
  }
}

// "Remind me" for one or many suggestions. Tasks land on My Day with the mailbox context attached.
export async function remindMe(items: FollowUp[]): Promise<Result<{ created: number; existing: number; ids: string[] }>> {
  try {
    const user = await actionStaff();
    const r = await createFollowUpTasks(user.id, items.slice(0, 100), user.id);
    paths();
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}
