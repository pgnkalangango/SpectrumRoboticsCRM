"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, actionStaff, AccessDenied } from "@/lib/session";
import { audit, logActivity, notify } from "@/lib/audit";
import { randomToken } from "@/lib/crypto";
import { appUrl, button, sendSystemMail } from "@/lib/mailer";
import { decideQuoteDiscount } from "@/lib/quotes/core";
import type { ApprovalType } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  if (e instanceof Error && e.message && !/prisma/i.test(e.message)) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const OWNER_ONLY: ApprovalType[] = ["QUOTE_DISCOUNT", "REFUND", "EXPENSE"];

type AccessDetails = { email?: string; company?: string | null; companyId?: string | null; kind?: "STAFF" | "CLIENT"; userId?: string; name?: string };

export async function decideApproval(id: string, decision: "APPROVED" | "REJECTED", note?: string): Promise<Result> {
  try {
    const user = await actionCan("approvals.decide");
    const a = await prisma.approval.findUnique({ where: { id }, include: { requestedBy: { select: { id: true, name: true, email: true } } } });
    if (!a) return { ok: false, error: "Approval not found." };
    if (a.status !== "PENDING") return { ok: false, error: "This request was already decided." };
    if ((OWNER_ONLY.includes(a.type) || a.requiredTier === "OWNER") && user.tier !== "OWNER") throw new AccessDenied("Only an owner can decide this request.");
    const cleanNote = note?.trim() || null;
    const approved = decision === "APPROVED";

    switch (a.type) {
      case "QUOTE_DISCOUNT": {
        const quoteId = a.entityId ?? (a.details as { quoteId?: string } | null)?.quoteId;
        if (!quoteId) return { ok: false, error: "This request is not linked to a quote." };
        await decideQuoteDiscount({ quoteId, decision, deciderId: user.id, note: cleanNote, approvalId: a.id });
        revalidatePath(`/hq/quotes/${quoteId}`);
        break;
      }
      case "ACCESS_REQUEST": {
        await handleAccessRequest(a.id, (a.details as AccessDetails | null) ?? {}, a.entityType === "User" ? a.entityId : null, approved, cleanNote, user.id);
        break;
      }
      case "SOCIAL_POST": {
        if (a.entityId) {
          const post = await prisma.socialPost.findUnique({ where: { id: a.entityId }, select: { id: true, authorId: true, title: true } });
          if (post) {
            await prisma.socialPost.update({ where: { id: post.id }, data: approved ? { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } : { status: "DRAFT", approvedById: null, approvedAt: null } });
            if (post.authorId && post.authorId !== user.id) await notify({ userId: post.authorId, type: "approval", title: approved ? "Post approved" : "Post sent back to draft", body: cleanNote ?? post.title ?? undefined, link: "/hq/marketing" });
            revalidatePath("/hq/marketing");
          }
        }
        break;
      }
      default:
        break;
    }

    if (a.type !== "QUOTE_DISCOUNT") {
      await prisma.approval.update({ where: { id: a.id }, data: { status: decision, decidedById: user.id, decidedAt: new Date(), decisionNote: cleanNote } });
      if (a.requestedById && a.requestedById !== user.id) await notify({ userId: a.requestedById, type: "approval", title: `${approved ? "Approved" : "Not approved"}: ${a.subject}`, body: cleanNote ?? undefined, link: "/hq/approvals?tab=history" });
    }
    await audit({ actorId: user.id, action: approved ? "approve" : "reject", entityType: "Approval", entityId: a.id, after: { type: a.type, subject: a.subject, note: cleanNote } });
    revalidatePath("/hq/approvals");
    revalidatePath("/hq", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function handleAccessRequest(approvalId: string, details: AccessDetails, entityUserId: string | null, approved: boolean, note: string | null, deciderId: string) {
  const userId = details.userId ?? entityUserId;
  const email = (details.email ?? "").toLowerCase();
  const first = (details.name ?? "").split(" ")[0] || "there";

  if (userId) {
    // A client who signed up on their own. Approve opens the portal; reject closes the account.
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, status: true, kind: true } });
    if (!u) throw new Error("The user behind this request no longer exists.");
    if (approved) {
      await prisma.user.update({ where: { id: u.id }, data: { status: "ACTIVE" } });
      await sendSystemMail({ to: u.email, subject: "Your Spectrum Robotics portal is ready", html: `<p>Hi ${u.name.split(" ")[0]},</p><p>Your access has been approved. Sign in to see your quotes, invoices, robots and support tickets.</p>${button(appUrl("/login?as=client"), "Open the client portal")}` });
      await logActivity({ type: "SYSTEM", subject: `Portal access approved for ${u.name}`, actorId: deciderId, source: "system" });
    } else {
      await prisma.user.update({ where: { id: u.id }, data: { status: "INACTIVE" } });
      await sendSystemMail({ to: u.email, subject: "About your Spectrum Robotics portal request", html: `<p>Hi ${u.name.split(" ")[0]},</p><p>Thanks for signing up. We were not able to open a portal account for this email right now.${note ? ` ${escapeHtml(note)}` : ""} If you are a Spectrum Robotics customer, reply to this email or call us at (630) 809-9698 and we will sort it out.</p>` });
    }
    await audit({ actorId: deciderId, action: approved ? "approve" : "reject", entityType: "User", entityId: u.id, after: { status: approved ? "ACTIVE" : "INACTIVE", approvalId } });
    await prisma.accessRequest.updateMany({ where: { email: u.email, status: "PENDING" }, data: { status: approved ? "APPROVED" : "DENIED", reviewedById: deciderId, reviewedAt: new Date(), adminNotes: note } });
    return;
  }

  if (!email) throw new Error("This request has no email address to reply to.");
  if (approved) {
    const kind = details.kind === "CLIENT" ? "CLIENT" : "STAFF";
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) throw new Error(`${email} already has an account. Manage it from Team or Client accounts instead.`);
    const token = randomToken(24);
    await prisma.invitation.create({
      data: { email, name: details.name ?? null, kind, tier: kind === "CLIENT" ? "CLIENT" : "EMPLOYEE", roleLabel: kind === "CLIENT" ? null : "sales_rep", companyId: details.companyId ?? null, token, invitedById: deciderId, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    const link = appUrl(`/invite/${token}`);
    await sendSystemMail({
      to: email,
      subject: kind === "CLIENT" ? "Your invitation to the Spectrum Robotics client portal" : "Your invitation to Spectrum HQ",
      html: `<p>Hi ${first},</p><p>${kind === "CLIENT" ? "You are invited to the Spectrum Robotics client portal, where you can see quotes, pay invoices and open support tickets." : "Your access to Spectrum HQ has been approved. Use the link below to set your password and get started."} The link works for 7 days.</p>${button(link, "Accept invitation")}`,
    });
    await audit({ actorId: deciderId, action: "invite", entityType: "Invitation", after: { email, kind, approvalId } });
  } else {
    await sendSystemMail({ to: email, subject: "About your Spectrum Robotics access request", html: `<p>Hi ${first},</p><p>Thanks for reaching out. We are not able to set up access for this request right now.${note ? ` ${escapeHtml(note)}` : ""} If you think this is a mistake, reply to this email and a member of the team will follow up.</p>` });
  }
  await prisma.accessRequest.updateMany({ where: { email, status: "PENDING" }, data: { status: approved ? "APPROVED" : "DENIED", reviewedById: deciderId, reviewedAt: new Date(), adminNotes: note } });
}

export async function withdrawApproval(id: string): Promise<Result> {
  try {
    const user = await actionStaff();
    const a = await prisma.approval.findUnique({ where: { id } });
    if (!a) return { ok: true };
    if (a.status !== "PENDING") return { ok: false, error: "This request was already decided." };
    if (a.requestedById !== user.id && user.tier === "EMPLOYEE") throw new AccessDenied("You can only withdraw your own requests.");
    await prisma.approval.update({ where: { id }, data: { status: "WITHDRAWN", decidedById: user.id, decidedAt: new Date() } });
    if (a.type === "QUOTE_DISCOUNT" && a.entityId) {
      await prisma.quote.updateMany({ where: { id: a.entityId, status: "PENDING_APPROVAL" }, data: { status: "DRAFT" } });
      revalidatePath(`/hq/quotes/${a.entityId}`);
    }
    revalidatePath("/hq/approvals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
