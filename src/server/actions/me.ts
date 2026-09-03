"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { audit } from "@/lib/audit";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));

// Only fields a person may change about themselves. Tier, permissions, status and email stay with owners.
const meSchema = z.object({
  name: z.string().min(2, "Enter your name.").max(120),
  title: opt(120),
  phone: opt(40),
  bookingLink: opt(300),
  territory: opt(120),
  timezone: z.string().max(60).default("America/Chicago"),
  avatarColor: opt(20),
  signatureHtml: z.string().max(20000).optional().nullable(),
  voiceProfile: z.string().max(50000).optional().nullable(),
});
export type MeInput = z.input<typeof meSchema>;

export async function updateMe(input: MeInput): Promise<Result> {
  try {
    const user = await actionStaff();
    const d = meSchema.parse(input);
    const before = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, title: true, phone: true, bookingLink: true, territory: true, timezone: true } });
    await prisma.user.update({ where: { id: user.id }, data: { name: d.name, title: d.title, phone: d.phone, bookingLink: d.bookingLink, territory: d.territory, timezone: d.timezone, avatarColor: d.avatarColor, signatureHtml: d.signatureHtml?.trim() || null, voiceProfile: d.voiceProfile?.trim() || null } });
    await audit({ actorId: user.id, action: "profile_update", entityType: "User", entityId: user.id, before, after: { name: d.name, title: d.title, phone: d.phone, bookingLink: d.bookingLink, territory: d.territory, timezone: d.timezone } });
    revalidatePath("/hq/me");
    revalidatePath("/hq", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(200);

export async function changePassword(currentPassword: string, newPassword: string): Promise<Result> {
  try {
    const user = await actionStaff();
    const check = passwordSchema.safeParse(newPassword);
    if (!check.success) return { ok: false, error: check.error.issues[0].message };
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (row?.passwordHash) {
      if (!currentPassword) return { ok: false, error: "Enter your current password." };
      const ok = await compare(currentPassword, row.passwordHash);
      if (!ok) return { ok: false, error: "Your current password is not right." };
      if (currentPassword === newPassword) return { ok: false, error: "Choose a password you have not used here before." };
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(newPassword, 12) } });
    await audit({ actorId: user.id, action: "password_change", entityType: "User", entityId: user.id });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const prefsSchema = z.object({
  emailDigest: z.enum(["daily", "weekly", "off"]).default("daily"),
  notifyOnApprovals: z.boolean().default(true),
  notifyOnTickets: z.boolean().default(true),
});
export type PreferencesInput = z.input<typeof prefsSchema>;

export async function updatePreferences(input: PreferencesInput): Promise<Result> {
  try {
    const user = await actionStaff();
    const d = prefsSchema.parse(input);
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
    const current = ((row?.preferences as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    await prisma.user.update({ where: { id: user.id }, data: { preferences: { ...current, ...d } } });
    revalidatePath("/hq/me");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
