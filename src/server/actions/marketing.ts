"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, actionCan, AccessDenied } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit, logActivity, notify } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { checkClaims, type ClaimsResult } from "@/lib/claims-check";
import { publishPost } from "@/lib/social/publish";
import { replyViaMeta } from "@/lib/social/meta";
import type { SocialPostStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: e instanceof Error && e.message ? e.message : "Something went wrong. Please try again." };
}

const opt = (max = 300) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));
const REVALIDATE = ["/hq/marketing", "/hq/marketing/campaigns", "/hq/approvals", "/hq"];
const refresh = () => REVALIDATE.forEach((p) => revalidatePath(p));

async function knownCompanyNames(): Promise<string[]> {
  const rows = await prisma.company.findMany({ where: { status: { in: ["ACTIVE", "PARTNER"] } }, select: { name: true } });
  return rows.map((r) => r.name);
}

async function runClaims(body: string, title: string | null, notes?: string | null): Promise<ClaimsResult> {
  return checkClaims(body, { knownCompanies: await knownCompanyNames(), metadata: [title, notes].filter(Boolean).join("\n") });
}

async function postApprovers(): Promise<{ id: string }[]> {
  const rows = await prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", OR: [{ tier: "OWNER" }, { permissions: { has: "social.post" } }] }, select: { id: true, tier: true, permissions: true } });
  return rows.filter((u) => u.tier === "OWNER" || !u.permissions.includes("-social.post"));
}

// ───────────────────────────── Posts ─────────────────────────────

const postSchema = z.object({
  title: opt(160),
  body: z.string().min(1, "Write the post first.").max(10000),
  linkUrl: opt(1000),
  mediaUrls: z.array(z.string().max(1000)).optional(),
  scheduledAt: opt(40),
  campaignId: opt(),
  canvaDesignId: opt(120),
  targetAccountIds: z.array(z.string()).optional(),
  notes: opt(2000),
});
export type PostInput = z.input<typeof postSchema>;

const EDITABLE: SocialPostStatus[] = ["DRAFT", "FAILED", "PENDING_APPROVAL"];

export async function savePost(input: PostInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("social.draft");
    const d = postSchema.parse(input);
    const canPost = can(user, "social.post");
    const mediaUrls = (d.mediaUrls ?? []).map((s) => s.trim()).filter(Boolean);
    const claims = await runClaims(d.body, d.title, d.notes);
    const stats = { notes: d.notes ?? null };
    const data = { title: d.title, body: d.body, linkUrl: d.linkUrl, mediaUrls, scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null, campaignId: d.campaignId, canvaDesignId: d.canvaDesignId, claimsCheck: JSON.parse(JSON.stringify(claims)) };
    let id = input.id;
    if (id) {
      const before = await prisma.socialPost.findUnique({ where: { id }, select: { status: true, authorId: true, stats: true } });
      if (!before) return { ok: false, error: "Post not found." };
      if (!canPost && (before.authorId !== user.id || !EDITABLE.includes(before.status))) return { ok: false, error: "Only the author can edit a draft. Scheduled and published posts need publishing rights." };
      if (before.status === "PUBLISHED") return { ok: false, error: "Published posts cannot be edited. Duplicate it to post again." };
      // Any edit to an approved or scheduled post sends it back to draft unless the editor can publish.
      const status: SocialPostStatus = canPost ? before.status : before.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "DRAFT";
      await prisma.socialPost.update({ where: { id }, data: { ...data, status, stats: { ...((before.stats as object) ?? {}), ...stats } } });
      await prisma.socialPostTarget.deleteMany({ where: { postId: id, socialAccountId: { notIn: d.targetAccountIds ?? [] } } });
      for (const accountId of d.targetAccountIds ?? []) await prisma.socialPostTarget.upsert({ where: { postId_socialAccountId: { postId: id, socialAccountId: accountId } }, create: { postId: id, socialAccountId: accountId }, update: {} });
    } else {
      const row = await prisma.socialPost.create({ data: { ...data, status: "DRAFT", authorId: user.id, stats, targets: { create: (d.targetAccountIds ?? []).map((socialAccountId) => ({ socialAccountId })) } } });
      id = row.id;
      await audit({ actorId: user.id, action: "create", entityType: "SocialPost", entityId: id, after: { status: "DRAFT" } });
    }
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function submitPostForApproval(id: string): Promise<Result> {
  try {
    const user = await actionCan("social.draft");
    const post = await prisma.socialPost.findUnique({ where: { id }, include: { targets: true } });
    if (!post) return { ok: false, error: "Post not found." };
    if (post.targets.length === 0) return { ok: false, error: "Pick at least one channel before submitting." };
    const claims = await runClaims(post.body, post.title, (post.stats as { notes?: string } | null)?.notes);
    const social = await getSetting("social");
    await prisma.socialPost.update({ where: { id }, data: { status: "PENDING_APPROVAL", claimsCheck: JSON.parse(JSON.stringify(claims)) } });
    const existing = await prisma.approval.findFirst({ where: { type: "SOCIAL_POST", entityId: id, status: "PENDING" } });
    if (!existing) {
      await prisma.approval.create({ data: { type: "SOCIAL_POST", subject: `Social post: ${post.title ?? post.body.slice(0, 60)}`, reason: claims.blocked ? "Claims check found a blocking issue. Review before approving." : claims.findings.length ? `${claims.findings.length} claims warning${claims.findings.length === 1 ? "" : "s"} to review.` : "Ready for review.", entityType: "SocialPost", entityId: id, requestedById: user.id, requiredTier: (social.approverTier as "OWNER" | "LEADERSHIP") ?? "OWNER", details: { postId: id, link: `/hq/marketing?open=${id}` } } });
    }
    const approvers = await postApprovers();
    await Promise.all(approvers.filter((a) => a.id !== user.id).map((a) => notify({ userId: a.id, type: "approval", title: "Social post waiting for approval", body: post.title ?? post.body.slice(0, 80), link: `/hq/marketing?open=${id}` })));
    await audit({ actorId: user.id, action: "submit_for_approval", entityType: "SocialPost", entityId: id, before: { status: post.status }, after: { status: "PENDING_APPROVAL" } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function settleApproval(postId: string, status: "APPROVED" | "REJECTED", decidedById: string, note?: string | null) {
  await prisma.approval.updateMany({ where: { type: "SOCIAL_POST", entityId: postId, status: "PENDING" }, data: { status, decidedById, decidedAt: new Date(), decisionNote: note ?? null } });
}

async function guardClaims(post: { body: string; title: string | null; stats: unknown }, overrideClaims?: boolean): Promise<string | null> {
  const claims = await runClaims(post.body, post.title, (post.stats as { notes?: string } | null)?.notes);
  if (claims.blocked && !overrideClaims) return "The claims check found a blocking issue (demo promise or guarantee). Fix the copy, or tick \"I have checked this\" to go ahead anyway.";
  return null;
}

// Approve and schedule (or just approve when no time is given). Needs social.post.
export async function approvePost(id: string, opts: { scheduledAt?: string | null; overrideClaims?: boolean } = {}): Promise<Result> {
  try {
    const user = await actionCan("social.post");
    const post = await prisma.socialPost.findUnique({ where: { id }, include: { targets: true } });
    if (!post) return { ok: false, error: "Post not found." };
    if (post.targets.length === 0) return { ok: false, error: "Pick at least one channel first." };
    const blocked = await guardClaims(post, opts.overrideClaims);
    if (blocked) return { ok: false, error: blocked };
    const scheduledAt = opts.scheduledAt ? new Date(opts.scheduledAt) : post.scheduledAt;
    const status: SocialPostStatus = scheduledAt ? "SCHEDULED" : "APPROVED";
    await prisma.socialPost.update({ where: { id }, data: { status, scheduledAt, approvedById: user.id, approvedAt: new Date(), claimsCheck: opts.overrideClaims ? { ...((post.claimsCheck as object) ?? {}), overriddenBy: user.id, overriddenAt: new Date().toISOString() } : undefined } });
    await settleApproval(id, "APPROVED", user.id);
    if (post.authorId && post.authorId !== user.id) await notify({ userId: post.authorId, type: "approval", title: status === "SCHEDULED" ? "Your post was approved and scheduled" : "Your post was approved", body: post.title ?? post.body.slice(0, 80), link: `/hq/marketing?open=${id}` });
    await audit({ actorId: user.id, action: status === "SCHEDULED" ? "approve_and_schedule" : "approve", entityType: "SocialPost", entityId: id, before: { status: post.status }, after: { status, scheduledAt, overrideClaims: !!opts.overrideClaims } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectPost(id: string, note: string): Promise<Result> {
  try {
    const user = await actionCan("social.post");
    const post = await prisma.socialPost.findUnique({ where: { id } });
    if (!post) return { ok: false, error: "Post not found." };
    await prisma.socialPost.update({ where: { id }, data: { status: "DRAFT" } });
    await settleApproval(id, "REJECTED", user.id, note);
    if (post.authorId && post.authorId !== user.id) await notify({ userId: post.authorId, type: "approval", title: "Your post needs changes", body: note || "See the reviewer's note.", link: `/hq/marketing?open=${id}` });
    await audit({ actorId: user.id, action: "reject", entityType: "SocialPost", entityId: id, before: { status: post.status }, after: { status: "DRAFT", note } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function schedulePost(id: string, scheduledAt: string, opts: { overrideClaims?: boolean } = {}): Promise<Result> {
  try {
    const user = await actionCan("social.post");
    const post = await prisma.socialPost.findUnique({ where: { id }, include: { targets: true } });
    if (!post) return { ok: false, error: "Post not found." };
    if (post.status === "PUBLISHED") return { ok: false, error: "This post is already published." };
    if (post.targets.length === 0) return { ok: false, error: "Pick at least one channel first." };
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a valid date and time." };
    const blocked = await guardClaims(post, opts.overrideClaims);
    if (blocked) return { ok: false, error: blocked };
    await prisma.socialPost.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: when, approvedById: post.approvedById ?? user.id, approvedAt: post.approvedAt ?? new Date() } });
    await settleApproval(id, "APPROVED", user.id);
    await audit({ actorId: user.id, action: post.status === "SCHEDULED" ? "reschedule" : "schedule", entityType: "SocialPost", entityId: id, before: { status: post.status, scheduledAt: post.scheduledAt }, after: { status: "SCHEDULED", scheduledAt: when, overrideClaims: !!opts.overrideClaims } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function unschedulePost(id: string): Promise<Result> {
  try {
    const user = await actionCan("social.post");
    const post = await prisma.socialPost.findUnique({ where: { id } });
    if (!post) return { ok: false, error: "Post not found." };
    if (post.status !== "SCHEDULED") return { ok: false, error: "Only scheduled posts can be unscheduled." };
    await prisma.socialPost.update({ where: { id }, data: { status: "APPROVED" } });
    await audit({ actorId: user.id, action: "unschedule", entityType: "SocialPost", entityId: id, before: { status: "SCHEDULED" }, after: { status: "APPROVED" } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function publishPostNow(id: string, opts: { overrideClaims?: boolean } = {}): Promise<Result<{ published: number; failed: number; errors: string[] }>> {
  try {
    const user = await actionCan("social.post");
    const post = await prisma.socialPost.findUnique({ where: { id }, include: { targets: true } });
    if (!post) return { ok: false, error: "Post not found." };
    if (post.status === "PUBLISHED") return { ok: false, error: "This post is already published." };
    if (post.targets.length === 0) return { ok: false, error: "Pick at least one channel first." };
    const blocked = await guardClaims(post, opts.overrideClaims);
    if (blocked) return { ok: false, error: blocked };
    await prisma.socialPost.update({ where: { id }, data: { approvedById: post.approvedById ?? user.id, approvedAt: post.approvedAt ?? new Date() } });
    await settleApproval(id, "APPROVED", user.id);
    const r = await publishPost(id, { actorId: user.id });
    refresh();
    if (!r.ok) return { ok: false, error: `${r.published} of ${r.published + r.failed} channels published. ${r.errors.map((e) => `${e.account}: ${e.error}`).join(" ")}` };
    return { ok: true, data: { published: r.published, failed: r.failed, errors: [] } };
  } catch (e) {
    return fail(e);
  }
}

export async function duplicatePost(id: string): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("social.draft");
    const post = await prisma.socialPost.findUnique({ where: { id }, include: { targets: true } });
    if (!post) return { ok: false, error: "Post not found." };
    const copy = await prisma.socialPost.create({ data: { title: post.title ? `${post.title} (copy)` : null, body: post.body, linkUrl: post.linkUrl, mediaUrls: post.mediaUrls, campaignId: post.campaignId, canvaDesignId: post.canvaDesignId, status: "DRAFT", authorId: user.id, claimsCheck: post.claimsCheck ?? undefined, targets: { create: post.targets.map((t) => ({ socialAccountId: t.socialAccountId })) } } });
    await audit({ actorId: user.id, action: "duplicate", entityType: "SocialPost", entityId: copy.id, after: { from: id } });
    refresh();
    return { ok: true, data: { id: copy.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePost(id: string): Promise<Result> {
  try {
    const user = await actionCan("social.draft");
    const post = await prisma.socialPost.findUnique({ where: { id } });
    if (!post) return { ok: true };
    const canPost = can(user, "social.post");
    if (post.status === "PUBLISHED") return { ok: false, error: "Published posts stay on record. Remove them on the platform if needed." };
    if (!canPost && (post.authorId !== user.id || !EDITABLE.includes(post.status))) return { ok: false, error: "You can only delete your own drafts." };
    await prisma.approval.updateMany({ where: { type: "SOCIAL_POST", entityId: id, status: "PENDING" }, data: { status: "WITHDRAWN", decidedAt: new Date() } });
    await prisma.socialPost.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "SocialPost", entityId: id, before: { status: post.status, title: post.title } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Inbox ─────────────────────────────

export async function replyToInboxItem(id: string, text: string): Promise<Result<{ sent: boolean; note?: string }>> {
  try {
    const user = await actionCan("social.draft");
    const body = text.trim();
    if (!body) return { ok: false, error: "Write a reply first." };
    const item = await prisma.socialInboxItem.findUnique({ where: { id }, include: { socialAccount: true } });
    if (!item) return { ok: false, error: "Inbox item not found." };
    const r = await replyViaMeta(item, body);
    const meta = (item.metadata as Record<string, unknown> | null) ?? {};
    const replies = [...((meta.replies as unknown[]) ?? []), { text: body, by: user.name, at: new Date().toISOString(), sent: r.ok, externalId: r.externalId ?? null, note: r.note ?? null }];
    await prisma.socialInboxItem.update({ where: { id }, data: { status: "replied", repliedAt: new Date(), metadata: { ...meta, replies } as Prisma.InputJsonValue } });
    await logActivity({ type: "SOCIAL", subject: `Replied to ${item.authorName ?? item.authorHandle ?? "a social message"}`, body, actorId: user.id, source: "social", direction: "OUTBOUND", contactId: (meta.contactId as string | undefined) ?? null, metadata: { inboxItemId: id, sent: r.ok } });
    refresh();
    return { ok: true, data: { sent: r.ok, note: r.ok ? undefined : r.note } };
  } catch (e) {
    return fail(e);
  }
}

export async function createContactFromInbox(id: string): Promise<Result<{ contactId: string }>> {
  try {
    const user = await actionStaff();
    const item = await prisma.socialInboxItem.findUnique({ where: { id }, include: { socialAccount: true } });
    if (!item) return { ok: false, error: "Inbox item not found." };
    const meta = (item.metadata as Record<string, unknown> | null) ?? {};
    if (meta.contactId) return { ok: true, data: { contactId: meta.contactId as string } };
    const name = (item.authorName ?? item.authorHandle ?? "Social contact").trim();
    const [firstName, ...rest] = name.split(/\s+/);
    const contact = await prisma.contact.create({ data: { firstName: firstName || "Social", lastName: rest.join(" ") || null, type: "LEAD", leadSource: "social", ownerId: user.id, tags: [item.socialAccount.provider.toLowerCase()], notes: `From ${item.socialAccount.provider.toLowerCase()} ${item.type} on ${item.socialAccount.name}${item.authorHandle ? ` (@${item.authorHandle})` : ""}:\n"${item.text}"` } });
    await prisma.socialInboxItem.update({ where: { id }, data: { metadata: { ...meta, contactId: contact.id } } });
    await logActivity({ type: "SOCIAL", subject: `${item.type === "message" ? "Message" : "Comment"} on ${item.socialAccount.name}`, body: item.text, contactId: contact.id, actorId: user.id, source: "social", direction: "INBOUND", occurredAt: item.receivedAt, metadata: { inboxItemId: id } });
    revalidatePath("/hq/contacts");
    refresh();
    return { ok: true, data: { contactId: contact.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveInboxItem(id: string, archived = true): Promise<Result> {
  try {
    await actionStaff();
    const item = await prisma.socialInboxItem.findUnique({ where: { id } });
    if (!item) return { ok: true };
    await prisma.socialInboxItem.update({ where: { id }, data: { status: archived ? "archived" : item.repliedAt ? "replied" : "open" } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Assets ─────────────────────────────

const assetSchema = z.object({
  name: z.string().min(1, "Give the asset a name.").max(160),
  url: z.string().url("Enter a full URL, starting with https://").max(1000),
  type: z.enum(["image", "video", "pdf", "design"]).default("image"),
  tags: z.array(z.string()).optional(),
  canvaDesignId: opt(120),
});
export type AssetInput = z.input<typeof assetSchema>;

export async function addAsset(input: AssetInput): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("social.draft");
    const d = assetSchema.parse(input);
    const row = await prisma.contentAsset.create({ data: { name: d.name, url: d.url, type: d.type, tags: (d.tags ?? []).map((t) => t.trim()).filter(Boolean), canvaDesignId: d.canvaDesignId, createdById: user.id } });
    refresh();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAsset(id: string): Promise<Result> {
  try {
    await actionCan("social.draft");
    await prisma.contentAsset.delete({ where: { id } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────────────────────── Campaigns ─────────────────────────────

const campaignSchema = z.object({
  name: z.string().min(1, "Give the campaign a name.").max(160),
  type: z.enum(["social", "email", "event", "ads", "outreach", "content"]).default("social"),
  status: z.enum(["planned", "active", "paused", "completed"]).default("planned"),
  channel: opt(60),
  description: opt(2000),
  startDate: opt(20),
  endDate: opt(20),
  budget: z.coerce.number().min(0).optional().nullable(),
  ownerId: opt(),
  utmCampaign: opt(120),
});
export type CampaignInput = z.input<typeof campaignSchema>;

export async function saveCampaign(input: CampaignInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("social.draft");
    const d = campaignSchema.parse(input);
    const data = { name: d.name, type: d.type, status: d.status, channel: d.channel, description: d.description, startDate: d.startDate ? new Date(d.startDate) : null, endDate: d.endDate ? new Date(d.endDate) : null, budget: d.budget ?? null, ownerId: d.ownerId ?? (input.id ? undefined : user.id), utmCampaign: d.utmCampaign };
    let id = input.id;
    if (id) {
      await prisma.campaign.update({ where: { id }, data });
    } else {
      const row = await prisma.campaign.create({ data: { ...data, ownerId: data.ownerId ?? user.id } });
      id = row.id;
      await audit({ actorId: user.id, action: "create", entityType: "Campaign", entityId: id, after: { name: d.name } });
    }
    refresh();
    revalidatePath(`/hq/marketing/campaigns/${id}`);
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCampaign(id: string): Promise<Result> {
  try {
    const user = await actionStaff("LEADERSHIP");
    const counts = await prisma.campaign.findUnique({ where: { id }, select: { _count: { select: { posts: true, deals: true } } } });
    if (!counts) return { ok: true };
    if (counts._count.posts + counts._count.deals > 0) return { ok: false, error: "This campaign still has posts or deals attached. Mark it completed instead." };
    await prisma.campaign.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Campaign", entityId: id });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
