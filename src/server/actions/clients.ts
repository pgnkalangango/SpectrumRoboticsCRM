"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, AccessDenied } from "@/lib/session";
import { audit, logActivity } from "@/lib/audit";
import { randomToken } from "@/lib/crypto";
import { appUrl, button, sendSystemMail } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const INVITE_DAYS = 7;

export async function setPortalEnabled(companyId: string, enabled: boolean): Promise<Result> {
  try {
    const actor = await actionCan("clients.manage");
    const before = await prisma.company.findUnique({ where: { id: companyId }, select: { portalEnabled: true, name: true } });
    if (!before) return { ok: false, error: "Company not found." };
    await prisma.company.update({ where: { id: companyId }, data: { portalEnabled: enabled } });
    await audit({ actorId: actor.id, action: "portal_toggle", entityType: "Company", entityId: companyId, before: { portalEnabled: before.portalEnabled }, after: { portalEnabled: enabled } });
    await logActivity({ type: "SYSTEM", subject: enabled ? "Client portal enabled" : "Client portal disabled", companyId, actorId: actor.id, source: "system" });
    revalidatePath("/hq/clients");
    revalidatePath(`/hq/companies/${companyId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const inviteSchema = z.object({
  companyId: z.string().min(1, "Pick the company."),
  name: z.string().min(2, "Enter their name.").max(120),
  email: z.string().email("Enter a valid email.").transform((v) => v.toLowerCase().trim()),
  contactId: z.string().optional().nullable(),
});
export type ClientInviteInput = z.input<typeof inviteSchema>;

async function sendClientInvite(params: { email: string; name: string; companyName: string; token: string; invitedBy: string }) {
  const company = await getSetting("company");
  const portal = await getSetting("portal");
  return sendSystemMail({
    to: params.email,
    subject: `Your ${company.name} client portal`,
    html: `<p>Hi ${params.name.split(" ")[0]},</p><p>${params.invitedBy} set up portal access for ${params.companyName}. In the portal you can see quotes and invoices, check on your robots, open support tickets and find training.</p>${button(appUrl(`/invite/${params.token}`), "Set up my portal login")}<p style="font-size:12px;color:#666">${portal.welcomeMessage} The link works for ${INVITE_DAYS} days.</p>`,
  });
}

export async function inviteClientUser(input: ClientInviteInput): Promise<Result<{ id: string; inviteUrl: string; delivered: boolean }>> {
  try {
    const actor = await actionCan("clients.manage");
    const d = inviteSchema.parse(input);
    const company = await prisma.company.findUnique({ where: { id: d.companyId }, select: { id: true, name: true, portalEnabled: true } });
    if (!company) return { ok: false, error: "Company not found." };
    const existing = await prisma.user.findUnique({ where: { email: d.email } });
    if (existing) return { ok: false, error: `${d.email} already has an account (${existing.status.toLowerCase()}).` };
    let contactId = d.contactId ?? null;
    if (contactId) {
      const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { companyId: true, user: { select: { id: true } } } });
      if (!c || c.companyId !== company.id) return { ok: false, error: "That contact belongs to a different company." };
      if (c.user) return { ok: false, error: "That contact already has a portal login." };
    } else {
      const byEmail = await prisma.contact.findFirst({ where: { email: d.email, companyId: company.id, user: null }, select: { id: true } });
      contactId = byEmail?.id ?? null;
    }
    if (!contactId) {
      const c = await prisma.contact.create({ data: { firstName: d.name.split(" ")[0], lastName: d.name.split(" ").slice(1).join(" ") || null, email: d.email, companyId: company.id, companyName: company.name, type: "CLIENT", ownerId: actor.id, leadSource: "other" } });
      contactId = c.id;
    }
    const user = await prisma.user.create({ data: { email: d.email, name: d.name, kind: "CLIENT", tier: "CLIENT", roleLabel: "client", status: "INVITED", companyId: company.id, contactId } });
    const token = randomToken(24);
    await prisma.invitation.create({ data: { email: d.email, name: d.name, kind: "CLIENT", tier: "CLIENT", roleLabel: "client", companyId: company.id, token, invitedById: actor.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) } });
    if (!company.portalEnabled) await prisma.company.update({ where: { id: company.id }, data: { portalEnabled: true } });
    const mail = await sendClientInvite({ email: d.email, name: d.name, companyName: company.name, token, invitedBy: actor.name });
    await audit({ actorId: actor.id, action: "client_invite", entityType: "User", entityId: user.id, after: { email: d.email, companyId: company.id } });
    await logActivity({ type: "SYSTEM", subject: `Portal invitation sent to ${d.name}`, companyId: company.id, contactId, actorId: actor.id, source: "system" });
    revalidatePath("/hq/clients");
    revalidatePath(`/hq/companies/${company.id}`);
    return { ok: true, data: { id: user.id, inviteUrl: appUrl(`/invite/${token}`), delivered: mail.delivered } };
  } catch (e) {
    return fail(e);
  }
}

export async function resendClientInvitation(userId: string): Promise<Result<{ inviteUrl: string; delivered: boolean }>> {
  try {
    const actor = await actionCan("clients.manage");
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: { select: { id: true, name: true } } } });
    if (!user || user.kind !== "CLIENT" || !user.company) return { ok: false, error: "Client user not found." };
    if (user.status !== "INVITED") return { ok: false, error: "This person already finished sign up." };
    await prisma.invitation.updateMany({ where: { email: user.email, acceptedAt: null }, data: { expiresAt: new Date() } });
    const token = randomToken(24);
    await prisma.invitation.create({ data: { email: user.email, name: user.name, kind: "CLIENT", tier: "CLIENT", roleLabel: "client", companyId: user.company.id, token, invitedById: actor.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) } });
    const mail = await sendClientInvite({ email: user.email, name: user.name, companyName: user.company.name, token, invitedBy: actor.name });
    await audit({ actorId: actor.id, action: "client_invite_resent", entityType: "User", entityId: userId });
    revalidatePath("/hq/clients");
    return { ok: true, data: { inviteUrl: appUrl(`/invite/${token}`), delivered: mail.delivered } };
  } catch (e) {
    return fail(e);
  }
}

export async function setClientUserStatus(userId: string, status: "ACTIVE" | "INACTIVE"): Promise<Result> {
  try {
    const actor = await actionCan("clients.manage");
    const before = await prisma.user.findUnique({ where: { id: userId } });
    if (!before || before.kind !== "CLIENT") return { ok: false, error: "Client user not found." };
    if (status === "ACTIVE" && !before.passwordHash && !before.emailVerified) return { ok: false, error: "They have not set a password yet. Resend the invitation instead." };
    await prisma.user.update({ where: { id: userId }, data: { status } });
    if (status === "INACTIVE") await prisma.session.deleteMany({ where: { userId } }).catch(() => null);
    await audit({ actorId: actor.id, action: status === "INACTIVE" ? "deactivate" : "reactivate", entityType: "User", entityId: userId, before: { status: before.status }, after: { status } });
    await logActivity({ type: "SYSTEM", subject: `Portal user ${before.name} ${status === "INACTIVE" ? "deactivated" : "reactivated"}`, companyId: before.companyId, contactId: before.contactId, actorId: actor.id, source: "system" });
    revalidatePath("/hq/clients");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approveSignup(userId: string, companyId?: string | null): Promise<Result> {
  try {
    const actor = await actionCan("clients.manage");
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { company: { select: { id: true, name: true } } } });
    if (!user || user.kind !== "CLIENT") return { ok: false, error: "Sign up not found." };
    const targetId = companyId || user.companyId;
    if (!targetId) return { ok: false, error: "Link this person to a company before approving." };
    const company = await prisma.company.findUnique({ where: { id: targetId }, select: { id: true, name: true, portalEnabled: true } });
    if (!company) return { ok: false, error: "Company not found." };
    await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE", companyId: company.id } });
    if (user.contactId) await prisma.contact.update({ where: { id: user.contactId }, data: { companyId: company.id, companyName: company.name, type: "CLIENT" } }).catch(() => null);
    if (!company.portalEnabled) await prisma.company.update({ where: { id: company.id }, data: { portalEnabled: true } });
    await prisma.approval.updateMany({ where: { type: "ACCESS_REQUEST", entityType: "User", entityId: userId, status: "PENDING" }, data: { status: "APPROVED", decidedById: actor.id, decidedAt: new Date() } });
    const settings = await getSetting("company");
    await sendSystemMail({ to: user.email, subject: `Your ${settings.name} portal is open`, html: `<p>Hi ${user.name.split(" ")[0]},</p><p>Your client portal for ${company.name} is ready. Sign in to see quotes, invoices, your robots and support.</p>${button(appUrl("/login?as=client"), "Open my portal")}` });
    await audit({ actorId: actor.id, action: "signup_approved", entityType: "User", entityId: userId, before: { status: user.status, companyId: user.companyId }, after: { status: "ACTIVE", companyId: company.id } });
    await logActivity({ type: "SYSTEM", subject: `Portal sign up approved for ${user.name}`, companyId: company.id, contactId: user.contactId, actorId: actor.id, source: "system" });
    revalidatePath("/hq/clients");
    revalidatePath("/hq/approvals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function denySignup(userId: string, note?: string | null): Promise<Result> {
  try {
    const actor = await actionCan("clients.manage");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.kind !== "CLIENT") return { ok: false, error: "Sign up not found." };
    await prisma.user.update({ where: { id: userId }, data: { status: "INACTIVE" } });
    await prisma.approval.updateMany({ where: { type: "ACCESS_REQUEST", entityType: "User", entityId: userId, status: "PENDING" }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date(), decisionNote: note ?? undefined } });
    const settings = await getSetting("company");
    await sendSystemMail({ to: user.email, subject: `About your ${settings.name} portal request`, html: `<p>Hi ${user.name.split(" ")[0]},</p><p>Thanks for signing up. We could not match your request to a current ${settings.name} customer account, so the portal is not open for it yet.${note ? ` ${note}` : ""}</p><p>If you think this is a mistake, reply to this email or call ${settings.phone} and we will sort it out.</p>` });
    await audit({ actorId: actor.id, action: "signup_denied", entityType: "User", entityId: userId, before: { status: user.status }, after: { status: "INACTIVE", note: note ?? null } });
    revalidatePath("/hq/clients");
    revalidatePath("/hq/approvals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
