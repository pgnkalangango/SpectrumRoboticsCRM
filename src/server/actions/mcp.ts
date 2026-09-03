"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, actionStaff, AccessDenied } from "@/lib/session";
import { encrypt, randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { discoverTools, callMcpTool } from "@/lib/mcp/gateway";
import { slugify } from "@/lib/utils";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  return { ok: false, error: (e as Error)?.message || "Something went wrong." };
}

const serverSchema = z.object({
  name: z.string().min(2).max(80),
  url: z.string().url("Enter the server's full URL, for example https://mcp.canva.com/mcp"),
  transport: z.enum(["streamable_http", "sse"]).default("streamable_http"),
  authType: z.enum(["NONE", "BEARER", "OAUTH"]).default("BEARER"),
  secretEnvName: z.string().max(80).optional().nullable(),
  secretValue: z.string().max(4000).optional().nullable(),
  headersJson: z.string().max(4000).optional().nullable(),
  allowedTools: z.array(z.string()).optional(),
  enabledForTiers: z.array(z.enum(["OWNER", "LEADERSHIP", "EMPLOYEE"])).optional(),
  enabled: z.boolean().optional(),
  description: z.string().max(500).optional().nullable(),
});
export type McpServerInput = z.input<typeof serverSchema>;

export async function saveMcpServer(input: McpServerInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("integrations.manage");
    const d = serverSchema.parse(input);
    let headers: Record<string, string> | undefined;
    if (d.headersJson?.trim()) {
      try {
        headers = JSON.parse(d.headersJson) as Record<string, string>;
      } catch {
        return { ok: false, error: "Extra headers must be valid JSON, for example {\"X-Api-Key\": \"...\"}" };
      }
    }
    const data = {
      name: d.name,
      url: d.url,
      transport: d.transport,
      authType: d.authType,
      secretEnvName: d.secretEnvName?.trim() || null,
      ...(d.secretValue?.trim() ? { secretValue: encrypt(d.secretValue.trim()) } : {}),
      headers: headers ?? undefined,
      allowedTools: d.allowedTools ?? [],
      enabledForTiers: d.enabledForTiers ?? ["OWNER", "LEADERSHIP"],
      enabled: d.enabled ?? true,
      description: d.description ?? null,
    };
    let id = input.id;
    if (id) await prisma.mcpServer.update({ where: { id }, data });
    else {
      const slug = slugify(d.name) || `server-${Date.now()}`;
      const row = await prisma.mcpServer.create({ data: { ...data, slug: (await prisma.mcpServer.findUnique({ where: { slug } })) ? `${slug}-${Date.now().toString(36)}` : slug, createdById: user.id } });
      id = row.id;
    }
    await audit({ actorId: user.id, action: input.id ? "update" : "create", entityType: "McpServer", entityId: id, after: { name: d.name, url: d.url, enabled: data.enabled, tiers: data.enabledForTiers } });
    revalidatePath("/hq/mcp");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMcpServer(id: string): Promise<Result> {
  try {
    const user = await actionCan("integrations.manage");
    await prisma.mcpServer.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "McpServer", entityId: id });
    revalidatePath("/hq/mcp");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function testMcpServer(id: string): Promise<Result<{ tools: { name: string; description: string }[] }>> {
  try {
    await actionCan("integrations.manage");
    const tools = await discoverTools(id);
    revalidatePath("/hq/mcp");
    return { ok: true, data: { tools: tools.map((t) => ({ name: t.name, description: t.description })) } };
  } catch (e) {
    revalidatePath("/hq/mcp");
    return fail(e);
  }
}

export async function runMcpToolNow(serverId: string, tool: string, argsJson: string): Promise<Result<{ result: string }>> {
  try {
    const user = await actionCan("integrations.manage");
    let args: Record<string, unknown> = {};
    if (argsJson.trim()) args = JSON.parse(argsJson) as Record<string, unknown>;
    const result = await callMcpTool({ serverId, tool, args, userId: user.id });
    return { ok: true, data: { result: typeof result === "string" ? result : JSON.stringify(result, null, 2) } };
  } catch (e) {
    return fail(e);
  }
}

export async function createApiKey(input: { name: string; scopes: ("read" | "draft" | "write")[]; expiresDays?: number | null }): Promise<Result<{ key: string; id: string }>> {
  try {
    const user = await actionCan("mcp.keys");
    const name = input.name.trim().slice(0, 80) || "Personal key";
    const scopes = input.scopes.length ? input.scopes : ["read"];
    if (scopes.includes("write") && user.tier === "EMPLOYEE") return { ok: false, error: "Write scope keys are for leadership and owners. Ask an owner if you need one." };
    const key = `shq_${randomToken(30)}`;
    const row = await prisma.apiKey.create({ data: { userId: user.id, name, prefix: key.slice(0, 10), hashedKey: sha256(key), scopes, expiresAt: input.expiresDays ? new Date(Date.now() + input.expiresDays * 86400000) : null } });
    await audit({ actorId: user.id, action: "create", entityType: "ApiKey", entityId: row.id, after: { name, scopes } });
    revalidatePath("/hq/mcp");
    return { ok: true, data: { key, id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeApiKey(id: string): Promise<Result> {
  try {
    const user = await actionStaff();
    const k = await prisma.apiKey.findUnique({ where: { id } });
    if (!k) return { ok: true };
    if (k.userId !== user.id && user.tier !== "OWNER") return { ok: false, error: "You can only revoke your own keys." };
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit({ actorId: user.id, action: "revoke", entityType: "ApiKey", entityId: id });
    revalidatePath("/hq/mcp");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
