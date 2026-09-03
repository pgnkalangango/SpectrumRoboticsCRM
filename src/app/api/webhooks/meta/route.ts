import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyTier } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

// Meta webhook for Facebook page and Instagram comments and messages.
// GET handles the subscription challenge (verify token = META_WEBHOOK_VERIFY_TOKEN).
// POST stores each comment or message as a SocialInboxItem, deduplicated by external id.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "META_WEBHOOK_VERIFY_TOKEN is not set" }, { status: 503 });
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
    return new NextResponse(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

function signatureOk(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // Nothing to verify against; accept and rely on dedupe.
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.slice(7);
  return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

type Change = { field?: string; value?: Record<string, unknown> };
type Messaging = { sender?: { id?: string; username?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } };
type Entry = { id?: string; time?: number; changes?: Change[]; messaging?: Messaging[] };

type Incoming = { accountExternalId: string; type: "comment" | "message" | "mention"; externalId: string; authorName: string | null; authorHandle: string | null; text: string; receivedAt: Date; metadata: Record<string, unknown> };

function parseEntries(object: string, entries: Entry[]): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of entries) {
    const accountId = entry.id ?? "";
    for (const m of entry.messaging ?? []) {
      if (!m.message?.mid || m.message.is_echo || !m.sender?.id || m.sender.id === accountId) continue;
      out.push({ accountExternalId: accountId, type: "message", externalId: m.message.mid, authorName: m.sender.username ?? null, authorHandle: m.sender.username ?? null, text: m.message.text ?? "(attachment)", receivedAt: new Date(m.timestamp ?? Date.now()), metadata: { senderId: m.sender.id, object } });
    }
    for (const c of entry.changes ?? []) {
      const v = c.value ?? {};
      if (object === "page" && c.field === "feed" && v.item === "comment" && v.verb !== "remove") {
        const from = v.from as { id?: string; name?: string } | undefined;
        if (from?.id === accountId) continue;
        out.push({ accountExternalId: accountId, type: "comment", externalId: String(v.comment_id ?? ""), authorName: from?.name ?? null, authorHandle: null, text: String(v.message ?? ""), receivedAt: new Date(Number(v.created_time ?? Date.now() / 1000) * 1000), metadata: { commentId: v.comment_id, postId: v.post_id, senderId: from?.id, object } });
      } else if (object === "instagram" && (c.field === "comments" || c.field === "mentions")) {
        const from = v.from as { id?: string; username?: string } | undefined;
        if (from?.id === accountId) continue;
        const id = String(v.id ?? v.comment_id ?? "");
        out.push({ accountExternalId: accountId, type: c.field === "mentions" ? "mention" : "comment", externalId: id, authorName: from?.username ?? null, authorHandle: from?.username ?? null, text: String(v.text ?? ""), receivedAt: new Date(), metadata: { commentId: id, mediaId: (v.media as { id?: string } | undefined)?.id, senderId: from?.id, object } });
      }
    }
  }
  return out.filter((i) => i.externalId);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!signatureOk(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  let body: { object?: string; entry?: Entry[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const object = body.object ?? "";
  if (object !== "page" && object !== "instagram") return NextResponse.json({ ok: true, ignored: object });
  const items = parseEntries(object, body.entry ?? []);
  const accountIds = [...new Set(items.map((i) => i.accountExternalId))];
  const accounts = accountIds.length ? await prisma.socialAccount.findMany({ where: { externalId: { in: accountIds }, provider: { in: object === "page" ? ["FACEBOOK"] : ["INSTAGRAM"] } } }) : [];
  const byExternal = new Map(accounts.map((a) => [a.externalId, a]));
  let stored = 0;
  for (const item of items) {
    const account = byExternal.get(item.accountExternalId);
    if (!account) continue;
    const exists = await prisma.socialInboxItem.findUnique({ where: { externalId: item.externalId }, select: { id: true } });
    if (exists) continue;
    await prisma.socialInboxItem.create({ data: { socialAccountId: account.id, type: item.type, externalId: item.externalId, authorName: item.authorName, authorHandle: item.authorHandle, text: item.text, receivedAt: item.receivedAt, status: "open", metadata: item.metadata as Prisma.InputJsonValue } });
    stored++;
  }
  await prisma.webhookEvent.create({ data: { provider: "meta", externalId: `meta:${object}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, type: object, payload: body as object, processed: true } }).catch(() => null);
  if (stored > 0) await notifyTier({ minTier: "LEADERSHIP", type: "mention", title: `${stored} new social ${stored === 1 ? "message" : "messages"}`, body: "Reply from the marketing inbox.", link: "/hq/marketing?tab=inbox" });
  return NextResponse.json({ ok: true, received: items.length, stored });
}
