"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, AccessDenied } from "@/lib/session";
import { audit } from "@/lib/audit";
import { postSlack } from "@/lib/automations/digest";
import type { Tier } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: e instanceof Error && e.message ? e.message : "Something went wrong. Please try again." };
}

const refresh = () => revalidatePath("/hq/integrations");

function secretsPresent(names: string[]): boolean {
  return names.length > 0 && names.every((n) => !!process.env[n]);
}

export async function setIntegrationTiers(key: string, tiers: Tier[]): Promise<Result> {
  try {
    const user = await actionCan("integrations.manage");
    const allowed = tiers.filter((t) => t === "OWNER" || t === "LEADERSHIP" || t === "EMPLOYEE");
    const before = await prisma.integration.findUnique({ where: { key } });
    if (!before) return { ok: false, error: "Integration not found." };
    await prisma.integration.update({ where: { key }, data: { enabledForTiers: allowed.length ? allowed : ["OWNER"] } });
    await audit({ actorId: user.id, action: "update", entityType: "Integration", entityId: before.id, before: { enabledForTiers: before.enabledForTiers }, after: { enabledForTiers: allowed } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Disable hides the integration everywhere; enabling restores a computed status.
export async function setIntegrationDisabled(key: string, disabled: boolean): Promise<Result> {
  try {
    const user = await actionCan("integrations.manage");
    const row = await prisma.integration.findUnique({ where: { key } });
    if (!row) return { ok: false, error: "Integration not found." };
    let status = row.status;
    if (disabled) status = "DISABLED";
    else {
      const connection = key === "linkedin" ? await prisma.connection.findFirst({ where: { provider: "LINKEDIN", kind: "social" } }) : key === "meta" ? await prisma.connection.findFirst({ where: { provider: "META", kind: "social" } }) : key === "quickbooks" ? await prisma.connection.findFirst({ where: { provider: "QUICKBOOKS" } }) : null;
      status = connection ? "CONNECTED" : row.mechanism === "api_key" || row.mechanism === "webhook" ? (secretsPresent(row.secretNames) ? "CONNECTED" : "NOT_CONFIGURED") : secretsPresent(row.secretNames) ? "PENDING" : "NOT_CONFIGURED";
    }
    await prisma.integration.update({ where: { key }, data: { status } });
    await audit({ actorId: user.id, action: disabled ? "disable" : "enable", entityType: "Integration", entityId: row.id, before: { status: row.status }, after: { status } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function testIntegration(key: string): Promise<Result<{ message: string }>> {
  try {
    const user = await actionCan("integrations.manage");
    const row = await prisma.integration.findUnique({ where: { key } });
    if (!row) return { ok: false, error: "Integration not found." };
    let message = "";
    try {
      switch (key) {
        case "anthropic": {
          if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
          const { default: Anthropic } = await import("@anthropic-ai/sdk");
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const page = await client.models.list({ limit: 1 });
          const first = page.data[0];
          message = first ? `Connected. First model returned: ${first.display_name ?? first.id}.` : "Connected. The Models API answered.";
          break;
        }
        case "stripe": {
          if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set.");
          const { default: Stripe } = await import("stripe");
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
          const balance = await stripe.balance.retrieve();
          const available = balance.available.reduce((a, b) => a + b.amount, 0) / 100;
          message = `Connected. Available balance ${available.toLocaleString("en-US", { style: "currency", currency: (balance.available[0]?.currency ?? "usd").toUpperCase() })}${balance.livemode ? "" : " (test mode)"}.`;
          break;
        }
        case "slack": {
          const r = await postSlack(`Spectrum HQ test message from ${user.name}. If you can read this, Slack notifications work.`);
          if (!r.ok) throw new Error(r.reason ?? "Slack did not accept the message.");
          message = "Test message posted to Slack.";
          break;
        }
        case "linkedin": {
          const c = await prisma.connection.findFirst({ where: { provider: "LINKEDIN", kind: "social" } });
          if (!c) throw new Error("LinkedIn is not connected yet.");
          const { syncLinkedInOrganizations } = await import("@/lib/social/linkedin");
          const n = await syncLinkedInOrganizations(c.id);
          message = `Connected. ${n} organization page${n === 1 ? "" : "s"} available.`;
          break;
        }
        case "meta": {
          const c = await prisma.connection.findFirst({ where: { provider: "META", kind: "social" } });
          if (!c) throw new Error("Facebook is not connected yet.");
          const { syncMetaPages } = await import("@/lib/social/meta");
          const r = await syncMetaPages(c.id);
          message = `Connected. ${r.pages} Facebook page${r.pages === 1 ? "" : "s"} and ${r.instagram} Instagram account${r.instagram === 1 ? "" : "s"}.`;
          break;
        }
        default:
          return { ok: false, error: "This integration has no test yet." };
      }
      await prisma.integration.update({ where: { key }, data: { status: row.status === "DISABLED" ? "DISABLED" : "CONNECTED", lastSyncAt: new Date(), lastError: null } });
    } catch (e) {
      const err = e instanceof Error ? e.message : "Test failed";
      await prisma.integration.update({ where: { key }, data: { status: row.status === "DISABLED" ? "DISABLED" : "ERROR", lastError: err.slice(0, 500) } });
      await audit({ actorId: user.id, action: "test_failed", entityType: "Integration", entityId: row.id, after: { error: err } });
      refresh();
      return { ok: false, error: err };
    }
    await audit({ actorId: user.id, action: "test", entityType: "Integration", entityId: row.id, after: { message } });
    refresh();
    return { ok: true, data: { message } };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectSocial(provider: "LINKEDIN" | "META"): Promise<Result> {
  try {
    const user = await actionCan("integrations.manage");
    const providers = provider === "META" ? (["FACEBOOK", "INSTAGRAM"] as const) : (["LINKEDIN"] as const);
    await prisma.socialAccount.updateMany({ where: { provider: { in: [...providers] } }, data: { status: "disconnected", connectionId: null } });
    await prisma.connection.updateMany({ where: { provider, kind: "social" }, data: { status: "REVOKED" } });
    await prisma.integration.updateMany({ where: { key: provider === "META" ? "meta" : "linkedin" }, data: { status: "NOT_CONFIGURED" } });
    await audit({ actorId: user.id, action: "disconnect", entityType: "Connection", after: { provider } });
    refresh();
    revalidatePath("/hq/marketing");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
