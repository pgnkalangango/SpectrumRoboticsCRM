// Publishes a SocialPost to every target account, records per target results and updates the
// post status. Used by "Publish now" and by the cron scheduler.
import { prisma } from "@/lib/prisma";
import { audit, logActivity } from "@/lib/audit";
import { publishToLinkedIn } from "@/lib/social/linkedin";
import { publishToFacebook, publishToInstagram } from "@/lib/social/meta";
import type { SocialPostStatus } from "@/generated/prisma/enums";

export type PublishResult = { ok: boolean; status: SocialPostStatus; published: number; failed: number; errors: { account: string; error: string }[] };

export async function publishPost(postId: string, opts: { actorId?: string | null } = {}): Promise<PublishResult> {
  const post = await prisma.socialPost.findUnique({ where: { id: postId }, include: { targets: { include: { socialAccount: { include: { connection: true } } } } } });
  if (!post) throw new Error("Post not found.");
  if (post.targets.length === 0) throw new Error("Pick at least one channel before publishing.");
  await prisma.socialPost.update({ where: { id: postId }, data: { status: "PUBLISHING" } });

  const errors: { account: string; error: string }[] = [];
  let published = 0;
  for (const target of post.targets) {
    if (target.status === "published") {
      published++;
      continue;
    }
    try {
      const acct = target.socialAccount;
      const outcome =
        acct.provider === "LINKEDIN" ? await publishToLinkedIn(acct, post) : acct.provider === "FACEBOOK" ? await publishToFacebook(acct, post) : acct.provider === "INSTAGRAM" ? await publishToInstagram(acct, post) : null;
      if (!outcome) throw new Error(`${acct.provider} publishing is not supported yet.`);
      await prisma.socialPostTarget.update({ where: { id: target.id }, data: { status: "published", publishedAt: new Date(), externalPostId: outcome.externalPostId, externalUrl: outcome.externalUrl, error: null } });
      published++;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      errors.push({ account: target.socialAccount.name, error: message });
      await prisma.socialPostTarget.update({ where: { id: target.id }, data: { status: "failed", error: message.slice(0, 500) } });
    }
  }

  const status: SocialPostStatus = errors.length === 0 ? "PUBLISHED" : "FAILED";
  const stats = { ...((post.stats as Record<string, unknown> | null) ?? {}), lastPublishAttemptAt: new Date().toISOString(), published, failed: errors.length, ...(status === "PUBLISHED" ? { publishedAt: new Date().toISOString() } : {}) };
  await prisma.socialPost.update({ where: { id: postId }, data: { status, stats } });
  await audit({ actorId: opts.actorId ?? null, action: status === "PUBLISHED" ? "publish" : "publish_failed", entityType: "SocialPost", entityId: postId, after: { published, failed: errors.length, errors } });
  await logActivity({ type: "SOCIAL", subject: status === "PUBLISHED" ? `Published: ${post.title ?? post.body.slice(0, 60)}` : `Publishing failed: ${post.title ?? post.body.slice(0, 60)}`, body: errors.length ? errors.map((e) => `${e.account}: ${e.error}`).join("\n") : `${published} channel${published === 1 ? "" : "s"}`, actorId: opts.actorId ?? null, actorLabel: opts.actorId ? undefined : "scheduler", source: "social", direction: "OUTBOUND", metadata: { postId } });
  return { ok: errors.length === 0, status, published, failed: errors.length, errors };
}

// The scheduler: publish every SCHEDULED post whose time has passed.
export async function publishDuePosts(now = new Date()): Promise<{ attempted: number; published: number; failed: number; results: { postId: string; status: SocialPostStatus; errors: string[] }[] }> {
  const due = await prisma.socialPost.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, select: { id: true }, orderBy: { scheduledAt: "asc" }, take: 25 });
  const results: { postId: string; status: SocialPostStatus; errors: string[] }[] = [];
  let published = 0;
  let failed = 0;
  for (const p of due) {
    try {
      const r = await publishPost(p.id);
      results.push({ postId: p.id, status: r.status, errors: r.errors.map((e) => `${e.account}: ${e.error}`) });
      if (r.ok) published++;
      else failed++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : "Unknown error";
      await prisma.socialPost.update({ where: { id: p.id }, data: { status: "FAILED", stats: { lastError: message } } }).catch(() => null);
      results.push({ postId: p.id, status: "FAILED", errors: [message] });
    }
  }
  return { attempted: due.length, published, failed, results };
}
