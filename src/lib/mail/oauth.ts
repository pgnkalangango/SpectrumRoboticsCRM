import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";
import type { Connection } from "@/generated/prisma/client";

// OAuth for each person's own mailbox and calendar. Microsoft 365 first, Google Workspace as the alternative.
export const MICROSOFT_SCOPES = ["offline_access", "openid", "profile", "email", "User.Read", "Mail.Read", "Mail.Send", "Calendars.ReadWrite", "Contacts.Read"];
export const GOOGLE_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/calendar"];

export function microsoftConfigured() {
  return !!(process.env.MICROSOFT_GRAPH_CLIENT_ID && process.env.MICROSOFT_GRAPH_CLIENT_SECRET);
}
export function googleConfigured() {
  return !!(process.env.GOOGLE_WORKSPACE_CLIENT_ID && process.env.GOOGLE_WORKSPACE_CLIENT_SECRET);
}

export function microsoftAuthorizeUrl(state: string) {
  const tenant = process.env.MICROSOFT_GRAPH_TENANT || "common";
  const p = new URLSearchParams({
    client_id: process.env.MICROSOFT_GRAPH_CLIENT_ID!,
    response_type: "code",
    redirect_uri: appUrl("/api/oauth/microsoft/callback"),
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${p}`;
}

export function googleAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_WORKSPACE_CLIENT_ID!,
    response_type: "code",
    redirect_uri: appUrl("/api/oauth/google/callback"),
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function postForm(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = (await r.json()) as TokenResponse;
  if (!r.ok || j.error) throw new Error(j.error_description || j.error || `Token request failed (${r.status})`);
  return j;
}

export async function exchangeMicrosoftCode(code: string) {
  const tenant = process.env.MICROSOFT_GRAPH_TENANT || "common";
  return postForm(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    client_id: process.env.MICROSOFT_GRAPH_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET!,
    code,
    redirect_uri: appUrl("/api/oauth/microsoft/callback"),
    grant_type: "authorization_code",
    scope: MICROSOFT_SCOPES.join(" "),
  });
}

export async function exchangeGoogleCode(code: string) {
  return postForm("https://oauth2.googleapis.com/token", {
    client_id: process.env.GOOGLE_WORKSPACE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET!,
    code,
    redirect_uri: appUrl("/api/oauth/google/callback"),
    grant_type: "authorization_code",
  });
}

async function refreshToken(conn: Connection): Promise<TokenResponse> {
  const refresh = conn.refreshToken ? decrypt(conn.refreshToken) : null;
  if (!refresh) throw new Error("No refresh token stored. Reconnect the mailbox.");
  if (conn.provider === "MICROSOFT") {
    const tenant = process.env.MICROSOFT_GRAPH_TENANT || "common";
    return postForm(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      client_id: process.env.MICROSOFT_GRAPH_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET!,
      refresh_token: refresh,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    });
  }
  return postForm("https://oauth2.googleapis.com/token", {
    client_id: process.env.GOOGLE_WORKSPACE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET!,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
}

// Returns a valid access token, refreshing and persisting when it is within two minutes of expiry.
export async function getAccessToken(conn: Connection): Promise<string> {
  const soon = Date.now() + 2 * 60 * 1000;
  if (conn.expiresAt && conn.expiresAt.getTime() > soon) return decrypt(conn.accessToken);
  try {
    const t = await refreshToken(conn);
    const expiresAt = new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
    await prisma.connection.update({
      where: { id: conn.id },
      data: { accessToken: encrypt(t.access_token), refreshToken: t.refresh_token ? encrypt(t.refresh_token) : undefined, expiresAt, status: "ACTIVE", lastError: null },
    });
    return t.access_token;
  } catch (e) {
    await prisma.connection.update({ where: { id: conn.id }, data: { status: "EXPIRED", lastError: (e as Error).message } }).catch(() => null);
    throw e;
  }
}

export async function storeConnection(params: { userId: string; provider: "MICROSOFT" | "GOOGLE"; token: TokenResponse; accountEmail: string; accountName?: string | null }) {
  const expiresAt = new Date(Date.now() + (params.token.expires_in ?? 3600) * 1000);
  const existing = await prisma.connection.findFirst({ where: { provider: params.provider, userId: params.userId, kind: "mail_calendar" } });
  const data = {
    accountEmail: params.accountEmail.toLowerCase(),
    accountName: params.accountName ?? null,
    scopes: (params.token.scope ?? "").split(/\s+/).filter(Boolean),
    accessToken: encrypt(params.token.access_token),
    refreshToken: params.token.refresh_token ? encrypt(params.token.refresh_token) : existing?.refreshToken ?? null,
    expiresAt,
    status: "ACTIVE" as const,
    lastError: null,
  };
  const row = existing
    ? await prisma.connection.update({ where: { id: existing.id }, data })
    : await prisma.connection.create({ data: { provider: params.provider, kind: "mail_calendar", userId: params.userId, ...data } });
  await prisma.integration.updateMany({ where: { key: params.provider === "MICROSOFT" ? "outlook" : "google" }, data: { status: "CONNECTED", lastError: null } });
  return row;
}
