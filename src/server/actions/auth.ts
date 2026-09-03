"use server";

import { z } from "zod";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl, button, sendSystemMail } from "@/lib/mailer";
import { audit, notifyTier } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

export type ActionResult = { ok: true; message?: string; redirect?: string } | { ok: false; error: string; fields?: Record<string, string> };

const passwordSchema = z.string().min(10, "Use at least 10 characters.").max(200);

export async function signInWithPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email and password." };
  const user = await prisma.user.findUnique({ where: { email }, select: { kind: true, status: true, passwordHash: true } });
  if (!user) return { ok: false, error: "No account with that email. Ask an owner for an invitation, or sign up as a client." };
  if (user.status === "INACTIVE") return { ok: false, error: "This account is deactivated. Contact Spectrum Robotics." };
  if (!user.passwordHash) return { ok: false, error: "This account has no password yet. Use the sign in link you were sent, or reset your password." };
  const fallback = user.kind === "STAFF" ? "/hq" : "/portal";
  const target = next && next.startsWith("/") ? next : fallback;
  try {
    await signIn("credentials", { email, password, redirectTo: target });
    return { ok: true, redirect: target };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof AuthError) return { ok: false, error: "That password is not right. Try again or reset it." };
    throw e;
  }
}

export async function signInWithProvider(provider: "microsoft-entra-id" | "google", next?: string) {
  await signIn(provider, { redirectTo: next && next.startsWith("/") ? next : "/hq" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

const requestAccessSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  company: z.string().max(160).optional(),
  reason: z.string().max(1000).optional(),
  kind: z.enum(["STAFF", "CLIENT"]).default("STAFF"),
});

export async function requestAccess(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = requestAccessSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const d = parsed.data;
  const email = d.email.toLowerCase();
  await prisma.accessRequest.create({ data: { name: d.name, email, company: d.company, reason: d.reason, requestedKind: d.kind } });
  await prisma.approval.create({ data: { type: "ACCESS_REQUEST", subject: `Access request from ${d.name}`, reason: d.reason, requiredTier: "LEADERSHIP", details: { email, company: d.company, kind: d.kind } } });
  await notifyTier({ minTier: "LEADERSHIP", type: "approval", title: `${d.name} asked for access`, body: d.company ? `${email} at ${d.company}` : email, link: "/hq/approvals" });
  return { ok: true, message: "Thanks. An owner will review your request and email you." };
}

const clientSignupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: passwordSchema,
  company: z.string().min(2).max(160),
  clientCode: z.string().max(40).optional(),
  phone: z.string().max(40).optional(),
});

export async function clientSignup(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = clientSignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const d = parsed.data;
  const email = d.email.toLowerCase();
  const portal = await getSetting("portal");
  if (!portal.selfSignup) return { ok: false, error: "Client sign up is by invitation right now. Ask your Spectrum Robotics contact for an invite." };
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "There is already an account with that email. Sign in instead." };

  const domain = email.split("@")[1];
  const code = d.clientCode?.trim().toUpperCase();
  let company = code ? await prisma.company.findFirst({ where: { clientCode: code } }) : null;
  if (!company && domain && !GENERIC_DOMAINS.has(domain)) company = await prisma.company.findFirst({ where: { domain: { equals: domain, mode: "insensitive" } } });
  const matched = !!company && (company.portalEnabled || !!code);
  const autoApprove = matched && portal.autoApproveMatchingDomain;

  if (!company) {
    company = await prisma.company.create({ data: { name: d.company, domain: GENERIC_DOMAINS.has(domain) ? null : domain, status: "PROSPECT", source: "portal_signup" } });
  }
  const passwordHash = await hash(d.password, 12);
  const contact = await prisma.contact.create({
    data: { firstName: d.name.split(" ")[0], lastName: d.name.split(" ").slice(1).join(" ") || null, email, phoneMobile: d.phone, companyId: company.id, companyName: company.name, type: matched ? "CLIENT" : "LEAD", leadSource: "website" },
  });
  const user = await prisma.user.create({
    data: { email, name: d.name, passwordHash, kind: "CLIENT", tier: "CLIENT", roleLabel: "client", status: autoApprove ? "ACTIVE" : "INVITED", companyId: company.id, contactId: contact.id, phone: d.phone },
  });

  const token = randomToken(24);
  await prisma.verificationToken.create({ data: { identifier: `verify:${email}`, token: sha256(token), expires: new Date(Date.now() + 1000 * 60 * 60 * 48) } });
  await sendSystemMail({
    to: email,
    subject: "Confirm your Spectrum Robotics portal account",
    html: `<p>Hi ${d.name.split(" ")[0]},</p><p>Confirm your email to finish setting up your client portal.</p>${button(appUrl(`/verify/${token}`), "Confirm my email")}`,
  });

  if (!autoApprove) {
    await prisma.approval.create({ data: { type: "ACCESS_REQUEST", subject: `Portal sign up: ${d.name} (${company.name})`, requiredTier: "LEADERSHIP", entityType: "User", entityId: user.id, details: { email, company: company.name, companyId: company.id } } });
    await notifyTier({ minTier: "LEADERSHIP", type: "approval", title: `New portal sign up: ${d.name}`, body: `${email} at ${company.name}. Approve to open the portal.`, link: "/hq/approvals" });
  }
  await audit({ actorEmail: email, action: "signup", entityType: "User", entityId: user.id, after: { kind: "CLIENT", autoApprove } });
  return {
    ok: true,
    message: autoApprove ? "Account created. Check your email to confirm, then sign in." : "Account created. We emailed you a confirmation link, and the Spectrum Robotics team will approve your portal access shortly.",
  };
}

const GENERIC_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com", "live.com", "msn.com", "proton.me", "protonmail.com"]);

export async function verifyEmail(token: string): Promise<ActionResult> {
  const hashed = sha256(token);
  const row = await prisma.verificationToken.findFirst({ where: { token: hashed, identifier: { startsWith: "verify:" } } });
  if (!row || row.expires < new Date()) return { ok: false, error: "This link has expired. Sign in and request a new one." };
  const email = row.identifier.replace("verify:", "");
  await prisma.user.update({ where: { email }, data: { emailVerified: new Date() } });
  await prisma.verificationToken.delete({ where: { identifier_token: { identifier: row.identifier, token: hashed } } });
  return { ok: true, message: "Email confirmed. You can sign in now." };
}

export async function forgotPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "Enter your email." };
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.status !== "INACTIVE") {
    const token = randomToken(24);
    await prisma.verificationToken.deleteMany({ where: { identifier: `reset:${email}` } });
    await prisma.verificationToken.create({ data: { identifier: `reset:${email}`, token: sha256(token), expires: new Date(Date.now() + 1000 * 60 * 60) } });
    await sendSystemMail({ to: email, subject: "Reset your Spectrum HQ password", html: `<p>Hi ${user.name.split(" ")[0]},</p><p>Use the link below to choose a new password. It works for one hour.</p>${button(appUrl(`/reset-password/${token}`), "Choose a new password")}` });
  }
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function resetPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const check = passwordSchema.safeParse(password);
  if (!check.success) return { ok: false, error: check.error.issues[0].message };
  const hashed = sha256(token);
  const row = await prisma.verificationToken.findFirst({ where: { token: hashed, identifier: { startsWith: "reset:" } } });
  if (!row || row.expires < new Date()) return { ok: false, error: "This link has expired. Request a new one." };
  const email = row.identifier.replace("reset:", "");
  await prisma.user.update({ where: { email }, data: { passwordHash: await hash(password, 12), emailVerified: new Date(), status: "ACTIVE" } });
  await prisma.verificationToken.deleteMany({ where: { identifier: row.identifier } });
  await audit({ actorEmail: email, action: "password_reset", entityType: "User" });
  return { ok: true, message: "Password updated. Sign in with your new password.", redirect: "/login?reset=1" };
}

export async function acceptInvitation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const check = passwordSchema.safeParse(password);
  if (!check.success) return { ok: false, error: check.error.issues[0].message };
  if (name.length < 2) return { ok: false, error: "Enter your name." };
  const inv = await prisma.invitation.findUnique({ where: { token } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) return { ok: false, error: "This invitation is no longer valid. Ask for a new one." };
  const email = inv.email.toLowerCase();
  const passwordHash = await hash(password, 12);
  const isClient = inv.kind === "CLIENT";
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      kind: isClient ? "CLIENT" : "STAFF",
      tier: isClient ? "CLIENT" : inv.tier,
      roleLabel: inv.roleLabel ?? (isClient ? "client" : "sales_rep"),
      departmentId: inv.departmentId,
      companyId: inv.companyId,
      status: "ACTIVE",
      emailVerified: new Date(),
    },
    update: { name, passwordHash, status: "ACTIVE", emailVerified: new Date(), tier: isClient ? "CLIENT" : inv.tier, departmentId: inv.departmentId ?? undefined, companyId: inv.companyId ?? undefined },
  });
  if (isClient && inv.companyId && !user.contactId) {
    const contact = await prisma.contact.create({ data: { firstName: name.split(" ")[0], lastName: name.split(" ").slice(1).join(" ") || null, email, companyId: inv.companyId, type: "CLIENT" } });
    await prisma.user.update({ where: { id: user.id }, data: { contactId: contact.id } });
  }
  await prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
  await audit({ actorId: user.id, actorEmail: email, action: "invitation_accepted", entityType: "User", entityId: user.id });
  try {
    await signIn("credentials", { email, password, redirectTo: isClient ? "/portal" : "/hq?welcome=1" });
  } catch (e) {
    if (isRedirectError(e)) throw e;
  }
  return { ok: true, redirect: isClient ? "/portal" : "/hq?welcome=1" };
}
