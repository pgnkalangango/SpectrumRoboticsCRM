// QuickBooks Online: OAuth2, token refresh, customers, invoices and payments. Tokens live in the
// shared Connection row (provider QUICKBOOKS, kind accounting, no user) and are encrypted at rest.
// Callers are responsible for access checks (owner only).

import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/mailer";
import { roundCents } from "@/lib/quotes/math";
import type { Prisma } from "@/generated/prisma/client";

export type QbResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

function env() {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID ?? "";
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET ?? "";
  const environment = (process.env.QUICKBOOKS_ENVIRONMENT ?? "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
  return { clientId, clientSecret, environment, redirectUri: appUrl("/api/oauth/quickbooks/callback"), apiBase: environment === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com" };
}

export function quickbooksConfigured(): boolean {
  const e = env();
  return !!(e.clientId && e.clientSecret);
}

export function quickbooksAuthUrl(state: string): string {
  const e = env();
  const p = new URLSearchParams({ client_id: e.clientId, response_type: "code", scope: SCOPE, redirect_uri: e.redirectUri, state });
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in?: number; token_type: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const e = env();
  const basic = Buffer.from(`${e.clientId}:${e.clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(params).toString() });
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!res.ok || !json.access_token || !json.refresh_token) throw new Error(json.error_description ?? json.error ?? `Intuit token request failed (${res.status}).`);
  return json as TokenResponse;
}

async function findConnection() {
  return prisma.connection.findFirst({ where: { provider: "QUICKBOOKS", kind: "accounting", userId: null } });
}

async function setIntegration(status: "CONNECTED" | "ERROR" | "NOT_CONFIGURED", extra: { lastError?: string | null; config?: Prisma.InputJsonValue; lastSyncAt?: Date } = {}) {
  await prisma.integration.upsert({
    where: { key: "quickbooks" },
    create: { key: "quickbooks", name: "QuickBooks Online", category: "accounting", mechanism: "oauth", scope: "shared", status, secretNames: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"], enabledForTiers: ["OWNER"], lastError: extra.lastError ?? null, config: extra.config, lastSyncAt: extra.lastSyncAt },
    update: { status, lastError: extra.lastError ?? null, ...(extra.config !== undefined ? { config: extra.config } : {}), ...(extra.lastSyncAt ? { lastSyncAt: extra.lastSyncAt } : {}) },
  });
}

// Called by the OAuth callback with the code and realmId Intuit returned.
export async function completeQuickbooksOAuth(code: string, realmId: string): Promise<QbResult<{ realmId: string }>> {
  try {
    const e = env();
    if (!quickbooksConfigured()) return { ok: false, error: "QuickBooks is not configured. Add QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET." };
    const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: e.redirectUri });
    const data = { accessToken: encrypt(t.access_token), refreshToken: encrypt(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000), externalId: realmId, scopes: [SCOPE], status: "ACTIVE" as const, lastError: null, metadata: { environment: e.environment, refreshTokenExpiresAt: t.x_refresh_token_expires_in ? new Date(Date.now() + t.x_refresh_token_expires_in * 1000).toISOString() : null } };
    const existing = await findConnection();
    if (existing) await prisma.connection.update({ where: { id: existing.id }, data });
    else await prisma.connection.create({ data: { provider: "QUICKBOOKS", kind: "accounting", userId: null, accountName: "QuickBooks Online", ...data } });
    let companyName: string | null = null;
    try {
      const info = await qbo<{ CompanyInfo?: { CompanyName?: string } }>("GET", `/companyinfo/${realmId}`);
      companyName = info.CompanyInfo?.CompanyName ?? null;
      if (companyName) await prisma.connection.updateMany({ where: { provider: "QUICKBOOKS", kind: "accounting", userId: null }, data: { accountName: companyName } });
    } catch {
      // Not fatal: the connection is stored; the name is cosmetic.
    }
    await setIntegration("CONNECTED", { config: { realmId, environment: e.environment, companyName } });
    return { ok: true, data: { realmId } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not connect QuickBooks.";
    await setIntegration("ERROR", { lastError: message });
    return { ok: false, error: message };
  }
}

export async function quickbooksStatus(): Promise<{ connected: boolean; configured: boolean; realmId: string | null; accountName: string | null; environment: string }> {
  const c = await findConnection();
  return { connected: !!c && c.status === "ACTIVE", configured: quickbooksConfigured(), realmId: c?.externalId ?? null, accountName: c?.accountName ?? null, environment: env().environment };
}

async function accessToken(): Promise<{ token: string; realmId: string }> {
  const c = await findConnection();
  if (!c || !c.externalId || !c.refreshToken) throw new Error("QuickBooks is not connected. Connect it from Integrations first.");
  if (c.status === "REVOKED") throw new Error("The QuickBooks connection was revoked. Connect it again.");
  const fresh = c.expiresAt && c.expiresAt.getTime() - Date.now() > 60_000;
  if (fresh) return { token: decrypt(c.accessToken), realmId: c.externalId };
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(c.refreshToken) });
    await prisma.connection.update({ where: { id: c.id }, data: { accessToken: encrypt(t.access_token), refreshToken: encrypt(t.refresh_token), expiresAt: new Date(Date.now() + t.expires_in * 1000), status: "ACTIVE", lastError: null } });
    return { token: t.access_token, realmId: c.externalId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Token refresh failed.";
    await prisma.connection.update({ where: { id: c.id }, data: { status: "EXPIRED", lastError: message } });
    await setIntegration("ERROR", { lastError: message });
    throw new Error(`QuickBooks needs to be reconnected: ${message}`);
  }
}

type QboFault = { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] } };

// The one fetch helper every QuickBooks call goes through.
async function qbo<T>(method: "GET" | "POST", path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  const { token, realmId } = await accessToken();
  const e = env();
  const qs = new URLSearchParams({ minorversion: "73", ...(query ?? {}) });
  const url = `${e.apiBase}/v3/company/${realmId}${path}?${qs}`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const fault = (json as QboFault | null)?.Fault?.Error?.[0];
    throw new Error(fault ? `${fault.Message ?? "QuickBooks error"}${fault.Detail ? `: ${fault.Detail}` : ""}` : `QuickBooks request failed (${res.status}).`);
  }
  return json as T;
}

async function query<T>(sql: string): Promise<T[]> {
  const r = await qbo<{ QueryResponse?: Record<string, T[] | number | undefined> }>("GET", "/query", undefined, { query: sql });
  const qr = r.QueryResponse ?? {};
  for (const v of Object.values(qr)) if (Array.isArray(v)) return v as T[];
  return [];
}

const esc = (s: string) => s.replace(/'/g, "\\'");

type QboCustomer = { Id: string; DisplayName: string; SyncToken?: string };

export async function ensureCustomer(companyId: string): Promise<QbResult<{ customerId: string }>> {
  try {
    const co = await prisma.company.findUnique({ where: { id: companyId }, include: { contacts: { where: { email: { not: null } }, take: 1, orderBy: { createdAt: "asc" } } } });
    if (!co) return { ok: false, error: "Company not found." };
    if (co.quickbooksCustomerId) return { ok: true, data: { customerId: co.quickbooksCustomerId } };
    const found = await query<QboCustomer>(`select * from Customer where DisplayName = '${esc(co.name)}'`);
    let id = found[0]?.Id;
    if (!id) {
      const contact = co.contacts[0];
      const created = await qbo<{ Customer: QboCustomer }>("POST", "/customer", {
        DisplayName: co.name,
        CompanyName: co.name,
        ...(contact?.email ? { PrimaryEmailAddr: { Address: contact.email } } : {}),
        ...(co.phone ? { PrimaryPhone: { FreeFormNumber: co.phone } } : {}),
        ...(contact ? { GivenName: contact.firstName, FamilyName: contact.lastName ?? undefined } : {}),
        ...(co.addressStreet || co.addressCity ? { BillAddr: { Line1: co.addressStreet ?? undefined, City: co.addressCity ?? undefined, CountrySubDivisionCode: co.addressState ?? undefined, PostalCode: co.addressZip ?? undefined } } : {}),
      });
      id = created.Customer.Id;
    }
    await prisma.company.update({ where: { id: co.id }, data: { quickbooksCustomerId: id } });
    return { ok: true, data: { customerId: id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not sync the customer." };
  }
}

type QboItem = { Id: string; Name: string; Type?: string };

// QuickBooks needs an ItemRef on every sales line. We use one generic service item.
async function ensureItem(): Promise<string> {
  const integ = await prisma.integration.findUnique({ where: { key: "quickbooks" } });
  const cfg = (integ?.config as { itemId?: string } | null) ?? {};
  if (cfg.itemId) return cfg.itemId;
  const NAME = "Robotics sales and services";
  let item = (await query<QboItem>(`select * from Item where Name = '${esc(NAME)}'`))[0];
  if (!item) item = (await query<QboItem>("select * from Item where Type = 'Service' maxresults 1"))[0];
  if (!item) {
    const accounts = await query<{ Id: string; Name: string }>("select * from Account where AccountType = 'Income' maxresults 1");
    if (!accounts[0]) throw new Error("No income account found in QuickBooks to attach sales to.");
    const created = await qbo<{ Item: QboItem }>("POST", "/item", { Name: NAME, Type: "Service", IncomeAccountRef: { value: accounts[0].Id } });
    item = created.Item;
  }
  await prisma.integration.update({ where: { key: "quickbooks" }, data: { config: { ...cfg, itemId: item.Id } } }).catch(() => null);
  return item.Id;
}

export async function syncInvoice(invoiceId: string): Promise<QbResult<{ quickbooksInvoiceId: string }>> {
  try {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { lines: { orderBy: { sortOrder: "asc" } }, company: true, contact: true } });
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (inv.status === "DRAFT") return { ok: false, error: "Send the invoice before syncing it to QuickBooks." };
    if (inv.status === "VOID") return { ok: false, error: "Void invoices are not synced." };
    if (!inv.companyId) return { ok: false, error: "Link the invoice to a company first. QuickBooks needs a customer." };
    const customer = await ensureCustomer(inv.companyId);
    if (!customer.ok) return customer;
    const itemId = await ensureItem();
    const Line = inv.lines.map((l, i) => ({
      LineNum: i + 1,
      DetailType: "SalesItemLineDetail",
      Amount: roundCents(Number(l.total)),
      Description: l.description,
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: l.quantity, UnitPrice: roundCents(Number(l.unitPrice)), TaxCodeRef: { value: l.pricingMode === "MONTHLY" ? "NON" : "TAX" } },
    }));
    const body: Record<string, unknown> = {
      CustomerRef: { value: customer.data.customerId },
      DocNumber: inv.number.slice(0, 21),
      TxnDate: inv.issueDate.toISOString().slice(0, 10),
      ...(inv.dueDate ? { DueDate: inv.dueDate.toISOString().slice(0, 10) } : {}),
      Line,
      ...(Number(inv.taxAmount) > 0 ? { TxnTaxDetail: { TotalTax: roundCents(Number(inv.taxAmount)) } } : {}),
      ...(inv.contact?.email ? { BillEmail: { Address: inv.contact.email } } : {}),
      ...(inv.notes ? { CustomerMemo: { value: inv.notes.slice(0, 1000) } } : {}),
      PrivateNote: `Spectrum HQ invoice ${inv.number}${inv.quoteId ? ` from quote` : ""}`,
    };
    let qbId = inv.quickbooksInvoiceId;
    if (qbId) {
      const current = await qbo<{ Invoice: { SyncToken: string } }>("GET", `/invoice/${qbId}`);
      const updated = await qbo<{ Invoice: { Id: string } }>("POST", "/invoice", { ...body, Id: qbId, SyncToken: current.Invoice.SyncToken, sparse: true });
      qbId = updated.Invoice.Id;
    } else {
      const created = await qbo<{ Invoice: { Id: string } }>("POST", "/invoice", body);
      qbId = created.Invoice.Id;
    }
    await prisma.invoice.update({ where: { id: inv.id }, data: { quickbooksInvoiceId: qbId, quickbooksSyncedAt: new Date() } });
    await setIntegration("CONNECTED", { lastSyncAt: new Date() });
    return { ok: true, data: { quickbooksInvoiceId: qbId } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not sync the invoice.";
    await setIntegration("ERROR", { lastError: message }).catch(() => null);
    return { ok: false, error: message };
  }
}

export async function syncPayment(paymentId: string): Promise<QbResult<{ quickbooksPaymentId: string }>> {
  try {
    const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { invoice: { include: { company: true } } } });
    if (!p) return { ok: false, error: "Payment not found." };
    if (p.quickbooksPaymentId) return { ok: true, data: { quickbooksPaymentId: p.quickbooksPaymentId } };
    let qbInvoiceId = p.invoice.quickbooksInvoiceId;
    if (!qbInvoiceId) {
      const synced = await syncInvoice(p.invoiceId);
      if (!synced.ok) return synced;
      qbInvoiceId = synced.data.quickbooksInvoiceId;
    }
    if (!p.invoice.companyId) return { ok: false, error: "The invoice has no company." };
    const customer = await ensureCustomer(p.invoice.companyId);
    if (!customer.ok) return customer;
    const created = await qbo<{ Payment: { Id: string } }>("POST", "/payment", {
      CustomerRef: { value: customer.data.customerId },
      TotalAmt: roundCents(Number(p.amount)),
      TxnDate: p.paidAt.toISOString().slice(0, 10),
      PaymentRefNum: (p.reference ?? p.stripePaymentIntentId ?? "").slice(0, 21) || undefined,
      PrivateNote: `Spectrum HQ payment on ${p.invoice.number} (${p.method.toLowerCase()})`,
      Line: [{ Amount: roundCents(Number(p.amount)), LinkedTxn: [{ TxnId: qbInvoiceId, TxnType: "Invoice" }] }],
    });
    await prisma.payment.update({ where: { id: p.id }, data: { quickbooksPaymentId: created.Payment.Id } });
    await setIntegration("CONNECTED", { lastSyncAt: new Date() });
    return { ok: true, data: { quickbooksPaymentId: created.Payment.Id } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not sync the payment.";
    await setIntegration("ERROR", { lastError: message }).catch(() => null);
    return { ok: false, error: message };
  }
}
