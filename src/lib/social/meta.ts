// Facebook pages and Instagram business accounts through the Meta Graph API.
// The company connection holds the long lived user token; each page's own token is encrypted
// into SocialAccount.metadata so publishing and replies never need the user token again.
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import type { SocialAccount, SocialInboxItem, SocialPost } from "@/generated/prisma/client";
import type { PublishOutcome } from "@/lib/social/linkedin";

export const GRAPH_VERSION = "v19.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_engagement", "pages_manage_metadata", "pages_messaging", "instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_messages", "business_management"];

export function metaConfigured(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaAuthorizeUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", redirect_uri: redirectUri, state, response_type: "code", scope: META_SCOPES.join(",") });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p}`;
}

type GraphError = { error?: { message?: string; code?: number; type?: string } };

export async function graph<T = Record<string, unknown>>(path: string, opts: { method?: "GET" | "POST"; token: string; params?: Record<string, string | undefined>; body?: Record<string, string | undefined> } = { token: "" }): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined) params.set(k, v);
  params.set("access_token", opts.token);
  const method = opts.method ?? "GET";
  const url = `${GRAPH}${path.startsWith("/") ? path : `/${path}`}${method === "GET" ? `?${params}` : ""}`;
  let init: RequestInit = { method };
  if (method === "POST") {
    const form = new URLSearchParams(params);
    for (const [k, v] of Object.entries(opts.body ?? {})) if (v !== undefined) form.set(k, v);
    init = { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form };
  }
  const r = await fetch(url, init);
  const json = (await r.json().catch(() => ({}))) as T & GraphError;
  if (!r.ok || json.error) throw new Error(`Meta API ${path}: ${json.error?.message ?? `HTTP ${r.status}`}`);
  return json;
}

export async function metaExchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; expires_in?: number }> {
  const short = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", { token: "", params: { client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: redirectUri, code } });
  // Long lived token (about 60 days).
  const long = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", { token: "", params: { grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, fb_exchange_token: short.access_token } });
  return long;
}

type PageRow = { id: string; name: string; access_token: string; username?: string; picture?: { data?: { url?: string } }; instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string } };

export async function connectMeta(code: string, redirectUri: string): Promise<{ connectionId: string; pages: number; instagram: number }> {
  const tok = await metaExchangeCode(code, redirectUri);
  const me = await graph<{ id: string; name?: string }>("/me", { token: tok.access_token, params: { fields: "id,name" } });
  const existing = await prisma.connection.findFirst({ where: { provider: "META", kind: "social", userId: null } });
  const data = {
    accessToken: encrypt(tok.access_token),
    expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : new Date(Date.now() + 60 * 86400000),
    scopes: META_SCOPES,
    status: "ACTIVE" as const,
    accountName: me.name ?? null,
    externalId: me.id,
    lastError: null,
    lastSyncAt: new Date(),
  };
  const connection = existing ? await prisma.connection.update({ where: { id: existing.id }, data }) : await prisma.connection.create({ data: { provider: "META", kind: "social", userId: null, ...data } });
  const counts = await syncMetaPages(connection.id);
  await prisma.integration.updateMany({ where: { key: "meta" }, data: { status: "CONNECTED", lastSyncAt: new Date(), lastError: null } });
  return { connectionId: connection.id, ...counts };
}

export async function syncMetaPages(connectionId: string): Promise<{ pages: number; instagram: number }> {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new Error("Connection not found");
  const userToken = decrypt(connection.accessToken);
  const res = await graph<{ data?: PageRow[] }>("/me/accounts", { token: userToken, params: { fields: "id,name,access_token,username,picture{url},instagram_business_account{id,username,name,profile_picture_url}", limit: "50" } });
  let pages = 0;
  let instagram = 0;
  for (const page of res.data ?? []) {
    const pageToken = encrypt(page.access_token);
    await prisma.socialAccount.upsert({
      where: { provider_externalId: { provider: "FACEBOOK", externalId: page.id } },
      create: { provider: "FACEBOOK", externalId: page.id, name: page.name, handle: page.username ?? null, avatarUrl: page.picture?.data?.url ?? null, connectionId, status: "connected", metadata: { pageAccessToken: pageToken } },
      update: { name: page.name, handle: page.username ?? null, avatarUrl: page.picture?.data?.url ?? null, connectionId, status: "connected", metadata: { pageAccessToken: pageToken } },
    });
    pages++;
    const ig = page.instagram_business_account;
    if (ig) {
      await prisma.socialAccount.upsert({
        where: { provider_externalId: { provider: "INSTAGRAM", externalId: ig.id } },
        create: { provider: "INSTAGRAM", externalId: ig.id, name: ig.name ?? ig.username ?? page.name, handle: ig.username ?? null, avatarUrl: ig.profile_picture_url ?? null, connectionId, status: "connected", metadata: { pageAccessToken: pageToken, pageId: page.id } },
        update: { name: ig.name ?? ig.username ?? page.name, handle: ig.username ?? null, avatarUrl: ig.profile_picture_url ?? null, connectionId, status: "connected", metadata: { pageAccessToken: pageToken, pageId: page.id } },
      });
      instagram++;
    }
  }
  return { pages, instagram };
}

export function pageToken(account: Pick<SocialAccount, "metadata" | "name">): string {
  const meta = (account.metadata ?? {}) as { pageAccessToken?: string };
  if (!meta.pageAccessToken) throw new Error(`${account.name} has no page token. Reconnect Facebook from Integrations.`);
  return decrypt(meta.pageAccessToken);
}

export async function publishToFacebook(account: SocialAccount, post: Pick<SocialPost, "body" | "linkUrl" | "mediaUrls">): Promise<PublishOutcome> {
  const token = pageToken(account);
  const image = post.mediaUrls[0];
  if (image) {
    const r = await graph<{ id: string; post_id?: string }>(`/${account.externalId}/photos`, { method: "POST", token, body: { url: image, caption: post.body } });
    const id = r.post_id ?? r.id;
    return { externalPostId: id, externalUrl: `https://www.facebook.com/${id}` };
  }
  const r = await graph<{ id: string }>(`/${account.externalId}/feed`, { method: "POST", token, body: { message: post.body, link: post.linkUrl ?? undefined } });
  return { externalPostId: r.id, externalUrl: `https://www.facebook.com/${r.id}` };
}

export async function publishToInstagram(account: SocialAccount, post: Pick<SocialPost, "body" | "linkUrl" | "mediaUrls">): Promise<PublishOutcome> {
  const token = pageToken(account);
  const image = post.mediaUrls[0];
  if (!image) throw new Error("Instagram posts need an image. Add a media URL.");
  const caption = post.linkUrl ? `${post.body}\n\n${post.linkUrl}` : post.body;
  const container = await graph<{ id: string }>(`/${account.externalId}/media`, { method: "POST", token, body: { image_url: image, caption } });
  const published = await graph<{ id: string }>(`/${account.externalId}/media_publish`, { method: "POST", token, body: { creation_id: container.id } });
  let permalink: string | null = null;
  try {
    const info = await graph<{ permalink?: string }>(`/${published.id}`, { token, params: { fields: "permalink" } });
    permalink = info.permalink ?? null;
  } catch {
    permalink = null;
  }
  return { externalPostId: published.id, externalUrl: permalink };
}

// Reply to a comment or message when the provider supports it. Returns ok=false with a note when it does not.
export async function replyViaMeta(item: SocialInboxItem & { socialAccount: SocialAccount }, text: string): Promise<{ ok: boolean; externalId?: string; note?: string }> {
  const acct = item.socialAccount;
  if (acct.provider !== "FACEBOOK" && acct.provider !== "INSTAGRAM") return { ok: false, note: "Replies through the API are only available for Facebook and Instagram. Reply on the platform and mark it here." };
  let token: string;
  try {
    token = pageToken(acct);
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : "No page token." };
  }
  const meta = (item.metadata ?? {}) as { senderId?: string; commentId?: string };
  try {
    if (item.type === "message") {
      const senderId = meta.senderId;
      if (!senderId) return { ok: false, note: "This message has no sender id, so it cannot be answered through the API." };
      const pageId = acct.provider === "INSTAGRAM" ? ((acct.metadata as { pageId?: string } | null)?.pageId ?? acct.externalId) : acct.externalId;
      const r = await graph<{ message_id?: string }>(`/${pageId}/messages`, { method: "POST", token, body: { recipient: JSON.stringify({ id: senderId }), messaging_type: "RESPONSE", message: JSON.stringify({ text }) } });
      return { ok: true, externalId: r.message_id };
    }
    const commentId = meta.commentId ?? item.externalId;
    const path = acct.provider === "INSTAGRAM" ? `/${commentId}/replies` : `/${commentId}/comments`;
    const r = await graph<{ id: string }>(path, { method: "POST", token, body: { message: text } });
    return { ok: true, externalId: r.id };
  } catch (e) {
    return { ok: false, note: e instanceof Error ? e.message : "Reply failed." };
  }
}
