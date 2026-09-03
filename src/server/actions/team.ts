"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, AccessDenied } from "@/lib/session";
import { audit, notify } from "@/lib/audit";
import { PERMISSIONS, TIER_LABELS, type PermissionKey } from "@/lib/permissions";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl, button, sendSystemMail } from "@/lib/mailer";
import { getSetting } from "@/lib/settings";
import type { Tier } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));
const permissionValue = z.string().refine((v) => (v.startsWith("-") ? v.slice(1) : v) in PERMISSIONS, "Unknown permission.");

const memberSchema = z.object({
  name: z.string().min(2, "Enter the person's name.").max(120),
  email: z.string().email("Enter a valid work email.").transform((v) => v.toLowerCase().trim()),
  tier: z.enum(["OWNER", "LEADERSHIP", "EMPLOYEE"]).default("EMPLOYEE"),
  roleLabel: z.string().max(40).default("sales_rep"),
  departmentId: opt(),
  title: opt(120),
  managerId: opt(),
  territory: opt(120),
  bookingLink: opt(300),
  phone: opt(40),
  approvalLimitPct: z.coerce.number().int().min(0).max(100).default(0),
  permissions: z.array(permissionValue).default([]),
});
export type TeamMemberInput = z.input<typeof memberSchema>;

const INVITE_DAYS = 7;

function cleanPermissions(list: string[]): string[] {
  // A key cannot be both granted and denied; the last one wins.
  const out = new Map<string, string>();
  for (const p of list) out.set(p.replace(/^-/, ""), p);
  return Array.from(out.values());
}

async function activeOwnerCount(): Promise<number> {
  return prisma.user.count({ where: { kind: "STAFF", tier: "OWNER", status: "ACTIVE" } });
}

async function sendInvite(params: { email: string; name: string; token: string; invitedBy: string; tier: Tier }) {
  const company = await getSetting("company");
  return sendSystemMail({
    to: params.email,
    subject: `${params.invitedBy} invited you to Spectrum HQ`,
    html: `<p>Hi ${params.name.split(" ")[0]},</p><p>${params.invitedBy} invited you to join ${company.name} on Spectrum HQ as ${TIER_LABELS[params.tier].toLowerCase()}. HQ is where the team keeps customers, quotes, service and the company playbook.</p>${button(appUrl(`/invite/${params.token}`), "Accept the invitation")}<p style="font-size:12px;color:#666">The link works for ${INVITE_DAYS} days.</p>`,
  });
}

export async function inviteTeamMember(input: TeamMemberInput): Promise<Result<{ id: string; inviteUrl: string; delivered: boolean }>> {
  try {
    const actor = await actionCan("team.manage");
    const d = memberSchema.parse(input);
    if (actor.tier !== "OWNER" && d.tier !== "EMPLOYEE") return { ok: false, error: "Only owners can invite leadership or other owners." };
    if (actor.tier !== "OWNER" && d.permissions.length) return { ok: false, error: "Only owners can change permissions." };
    const existing = await prisma.user.findUnique({ where: { email: d.email } });
    if (existing) return { ok: false, error: `${d.email} already has an account (${existing.status.toLowerCase()}). Open them from the list instead.` };
    const permissions = cleanPermissions(d.permissions);
    const user = await prisma.user.create({
      data: {
        email: d.email,
        name: d.name,
        kind: "STAFF",
        tier: d.tier,
        status: "INVITED",
        roleLabel: d.roleLabel,
        departmentId: d.departmentId,
        title: d.title,
        managerId: d.managerId,
        territory: d.territory,
        bookingLink: d.bookingLink,
        phone: d.phone,
        approvalLimitPct: d.approvalLimitPct,
        permissions,
      },
    });
    const token = randomToken(24);
    await prisma.invitation.create({ data: { email: d.email, name: d.name, kind: "STAFF", tier: d.tier, roleLabel: d.roleLabel, departmentId: d.departmentId, token, invitedById: actor.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) } });
    const mail = await sendInvite({ email: d.email, name: d.name, token, invitedBy: actor.name, tier: d.tier });
    await audit({ actorId: actor.id, action: "invite", entityType: "User", entityId: user.id, after: { email: d.email, tier: d.tier, roleLabel: d.roleLabel, permissions } });
    if (permissions.length) await audit({ actorId: actor.id, action: "permission_change", entityType: "User", entityId: user.id, before: { permissions: [] }, after: { permissions } });
    revalidatePath("/hq/team");
    return { ok: true, data: { id: user.id, inviteUrl: appUrl(`/invite/${token}`), delivered: mail.delivered } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTeamMember(id: string, input: TeamMemberInput): Promise<Result> {
  try {
    const actor = await actionCan("team.manage");
    const d = memberSchema.parse(input);
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before || before.kind !== "STAFF") return { ok: false, error: "Team member not found." };
    if (actor.tier !== "OWNER" && (before.tier !== "EMPLOYEE" || d.tier !== "EMPLOYEE")) return { ok: false, error: "Only owners can change leadership or owner accounts." };
    if (d.managerId === id) return { ok: false, error: "Someone cannot be their own manager." };
    const permissions = actor.tier === "OWNER" ? cleanPermissions(d.permissions) : before.permissions;
    if (before.tier === "OWNER" && d.tier !== "OWNER" && before.status === "ACTIVE" && (await activeOwnerCount()) <= 1) return { ok: false, error: "This is the last active owner. Make someone else an owner first." };
    if (before.id === actor.id && before.tier === "OWNER" && d.tier !== "OWNER") return { ok: false, error: "You cannot demote yourself. Ask another owner." };
    await prisma.user.update({
      where: { id },
      data: { name: d.name, tier: d.tier, roleLabel: d.roleLabel, departmentId: d.departmentId, title: d.title, managerId: d.managerId, territory: d.territory, bookingLink: d.bookingLink, phone: d.phone, approvalLimitPct: d.approvalLimitPct, permissions },
    });
    await audit({ actorId: actor.id, action: "update", entityType: "User", entityId: id, before: { name: before.name, roleLabel: before.roleLabel, departmentId: before.departmentId, title: before.title, managerId: before.managerId, approvalLimitPct: before.approvalLimitPct }, after: { name: d.name, roleLabel: d.roleLabel, departmentId: d.departmentId, title: d.title, managerId: d.managerId, approvalLimitPct: d.approvalLimitPct } });
    if (before.tier !== d.tier) {
      await audit({ actorId: actor.id, action: "tier_change", entityType: "User", entityId: id, before: { tier: before.tier }, after: { tier: d.tier } });
      await notify({ userId: id, type: "system", title: `Your access level is now ${TIER_LABELS[d.tier]}`, body: `Changed by ${actor.name}. Sign out and back in to pick it up.`, link: "/hq/me" });
    }
    const beforePerms = [...before.permissions].sort().join(",");
    const afterPerms = [...permissions].sort().join(",");
    if (beforePerms !== afterPerms) await audit({ actorId: actor.id, action: "permission_change", entityType: "User", entityId: id, before: { permissions: before.permissions }, after: { permissions } });
    revalidatePath("/hq/team");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setTeamMemberStatus(id: string, status: "ACTIVE" | "INACTIVE"): Promise<Result> {
  try {
    const actor = await actionCan("team.manage");
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before || before.kind !== "STAFF") return { ok: false, error: "Team member not found." };
    if (actor.tier !== "OWNER" && before.tier !== "EMPLOYEE") return { ok: false, error: "Only owners can deactivate leadership or owner accounts." };
    if (status === "INACTIVE") {
      if (before.id === actor.id) return { ok: false, error: "You cannot deactivate yourself." };
      if (before.tier === "OWNER" && before.status === "ACTIVE" && (await activeOwnerCount()) <= 1) return { ok: false, error: "This is the last active owner." };
      await prisma.user.update({ where: { id }, data: { status: "INACTIVE" } });
      await prisma.apiKey.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await prisma.session.deleteMany({ where: { userId: id } }).catch(() => null);
    } else {
      // Reactivating someone who never set a password puts them back to invited so they can finish sign up.
      await prisma.user.update({ where: { id }, data: { status: before.passwordHash || before.emailVerified ? "ACTIVE" : "INVITED" } });
    }
    await audit({ actorId: actor.id, action: status === "INACTIVE" ? "deactivate" : "reactivate", entityType: "User", entityId: id, before: { status: before.status }, after: { status } });
    revalidatePath("/hq/team");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resendInvitation(id: string): Promise<Result<{ inviteUrl: string; delivered: boolean }>> {
  try {
    const actor = await actionCan("team.manage");
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.kind !== "STAFF") return { ok: false, error: "Team member not found." };
    if (user.status !== "INVITED") return { ok: false, error: "This person already accepted. Send a password reset link instead." };
    await prisma.invitation.updateMany({ where: { email: user.email, acceptedAt: null }, data: { expiresAt: new Date() } });
    const token = randomToken(24);
    await prisma.invitation.create({ data: { email: user.email, name: user.name, kind: "STAFF", tier: user.tier, roleLabel: user.roleLabel, departmentId: user.departmentId, token, invitedById: actor.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) } });
    const mail = await sendInvite({ email: user.email, name: user.name, token, invitedBy: actor.name, tier: user.tier });
    await audit({ actorId: actor.id, action: "invite_resent", entityType: "User", entityId: id });
    revalidatePath("/hq/team");
    return { ok: true, data: { inviteUrl: appUrl(`/invite/${token}`), delivered: mail.delivered } };
  } catch (e) {
    return fail(e);
  }
}

export async function sendPasswordReset(id: string): Promise<Result<{ resetUrl: string; delivered: boolean }>> {
  try {
    const actor = await actionCan("team.manage");
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return { ok: false, error: "Team member not found." };
    if (user.status === "INACTIVE") return { ok: false, error: "Reactivate the account first." };
    const token = randomToken(24);
    await prisma.verificationToken.deleteMany({ where: { identifier: `reset:${user.email}` } });
    await prisma.verificationToken.create({ data: { identifier: `reset:${user.email}`, token: sha256(token), expires: new Date(Date.now() + 1000 * 60 * 60) } });
    const mail = await sendSystemMail({ to: user.email, subject: "Reset your Spectrum HQ password", html: `<p>Hi ${user.name.split(" ")[0]},</p><p>${actor.name} sent you a link to choose a new password. It works for one hour.</p>${button(appUrl(`/reset-password/${token}`), "Choose a new password")}` });
    await audit({ actorId: actor.id, action: "password_reset_sent", entityType: "User", entityId: id });
    return { ok: true, data: { resetUrl: appUrl(`/reset-password/${token}`), delivered: mail.delivered } };
  } catch (e) {
    return fail(e);
  }
}

export type { PermissionKey };
