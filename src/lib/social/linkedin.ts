// LinkedIn company page publishing. OAuth 2.0 (shared company connection), organizations the
// member administers become SocialAccount rows, and posts go out through the Posts API.
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import type { SocialAccount, Connection, SocialPost } from "@/generated/prisma/client";

export const LINKEDIN_SCOPES = ["w_member_social", "w_organization_social", "r_organization_social", "rw_organization_admin"];
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API = "https://api.linkedin.com";
export const LINKEDIN_VERSION = "202401";

export function linkedinConfigured(): boolean {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function linkedinAuthorizeUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({ response_type: "code", client_id: process.env.LINKEDIN_CLIENT_ID ?? "", redirect_uri: redirectUri, state, scope: LINKEDIN_SCOPES.join(" ") });
  return `${AUTHORIZE_URL}?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string };

export async function linkedinExchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: process.env.LINKEDIN_CLIENT_ID ?? "", client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "" });
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) throw new Error(`LinkedIn token exchange failed (${r.status}): ${await r.text()}`);
  return (await r.json()) as TokenResponse;
}

async function linkedinFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": LINKEDIN_VERSION, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export function connectionToken(connection: Connection): string {
  if (connection.status !== "ACTIVE") throw new Error("The LinkedIn connection is not active. Reconnect it from Integrations.");
  if (connection.expiresAt && connection.expiresAt.getTime() < Date.now()) throw new Error("The LinkedIn connection has expired. Reconnect it from Integrations.");
  return decrypt(connection.accessToken);
}

// Store (or refresh) the shared company connection and create SocialAccount rows for every
// organization the member administers.
export async function connectLinkedIn(code: string, redirectUri: string): Promise<{ connectionId: string; accounts: number }> {
  const tok = await linkedinExchangeCode(code, redirectUri);
  const existing = await prisma.connection.findFirst({ where: { provider: "LINKEDIN", kind: "social", userId: null } });
  const data = {
    accessToken: encrypt(tok.access_token),
    refreshToken: tok.refresh_token ? encrypt(tok.refresh_token) : null,
    expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
    scopes: (tok.scope ?? LINKEDIN_SCOPES.join(" ")).split(/[ ,]+/).filter(Boolean),
    status: "ACTIVE" as const,
    lastError: null,
    lastSyncAt: new Date(),
  };
  const connection = existing
    ? await prisma.connection.update({ where: { id: existing.id }, data })
    : await prisma.connection.create({ data: { provider: "LINKEDIN", kind: "social", userId: null, ...data } });
  const accounts = await syncLinkedInOrganizations(connection.id);
  await prisma.integration.updateMany({ where: { key: "linkedin" }, data: { status: "CONNECTED", lastSyncAt: new Date(), lastError: null } });
  return { connectionId: connection.id, accounts };
}

type AclResponse = { elements?: { organization: string; role?: string; state?: string; "organization~"?: { localizedName?: string; vanityName?: string; id?: number } }[] };

export async function syncLinkedInOrganizations(connectionId: string): Promise<number> {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new Error("Connection not found");
  const token = connectionToken(connection);
  const projection = "(elements*(organization~(localizedName,vanityName,id),role,state,organization))";
  const r = await linkedinFetch(token, `/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&projection=${encodeURIComponent(projection)}`);
  if (!r.ok) {
    const text = await r.text();
    await prisma.connection.update({ where: { id: connectionId }, data: { lastError: `organizationAcls ${r.status}: ${text.slice(0, 300)}` } });
    throw new Error(`Could not list LinkedIn organizations (${r.status}). ${text.slice(0, 200)}`);
  }
  const json = (await r.json()) as AclResponse;
  let count = 0;
  for (const el of json.elements ?? []) {
    const id = el.organization?.split(":").pop();
    if (!id) continue;
    const org = el["organization~"];
    await prisma.socialAccount.upsert({
      where: { provider_externalId: { provider: "LINKEDIN", externalId: id } },
      create: { provider: "LINKEDIN", externalId: id, name: org?.localizedName ?? `Organization ${id}`, handle: org?.vanityName ?? null, connectionId, status: "connected", metadata: { urn: el.organization, role: el.role } },
      update: { name: org?.localizedName ?? undefined, handle: org?.vanityName ?? undefined, connectionId, status: "connected", metadata: { urn: el.organization, role: el.role } },
    });
    count++;
  }
  return count;
}

export type PublishOutcome = { externalPostId: string; externalUrl: string | null };

// Publish a post to a LinkedIn organization page. Images are attached as a link only in v1.
// TODO(v2): upload images through /rest/images (initializeUpload + PUT bytes) and attach as content.media.
export async function publishToLinkedIn(account: SocialAccount & { connection: Connection | null }, post: Pick<SocialPost, "body" | "linkUrl" | "mediaUrls" | "title">): Promise<PublishOutcome> {
  if (!account.connection) throw new Error("This LinkedIn page has no connection. Reconnect LinkedIn from Integrations.");
  const token = connectionToken(account.connection);
  const link = post.linkUrl || post.mediaUrls[0] || null;
  const body: Record<string, unknown> = {
    author: `urn:li:organization:${account.externalId}`,
    commentary: post.body,
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (link) body.content = { article: { source: link, title: post.title || undefined } };
  const r = await linkedinFetch(token, "/rest/posts", { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`LinkedIn rejected the post (${r.status}): ${text.slice(0, 300)}`);
  }
  const urn = r.headers.get("x-restli-id") ?? r.headers.get("x-linkedin-id") ?? "";
  return { externalPostId: urn || `linkedin:${Date.now()}`, externalUrl: urn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}` : null };
}
