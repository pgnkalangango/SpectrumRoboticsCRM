import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { TIER_RANK } from "@/lib/permissions";
import type { McpServer, Prisma, Tier } from "@/generated/prisma/client";

// Gateway to outside MCP servers (Canva, media tools, anything with a Streamable HTTP endpoint).
// Owners register servers; tools are discovered, cached, allow listed per server and limited by tier.
export type McpToolDef = { name: string; remoteName: string; serverId: string; serverName: string; description: string; inputSchema: Record<string, unknown> };

function headersFor(server: McpServer): Record<string, string> {
  const h: Record<string, string> = { ...((server.headers as Record<string, string> | null) ?? {}) };
  if (server.authType === "BEARER") {
    const token = server.secretEnvName ? process.env[server.secretEnvName] : server.secretValue ? decrypt(server.secretValue) : undefined;
    if (token) h.Authorization = `Bearer ${token}`;
  }
  return h;
}

export async function connectMcp(server: McpServer): Promise<Client> {
  const client = new Client({ name: "spectrum-hq", version: "1.0.0" });
  const headers = headersFor(server);
  const url = new URL(server.url);
  if (server.transport === "sse") {
    await client.connect(new SSEClientTransport(url, { requestInit: { headers } }));
    return client;
  }
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
  } catch (e) {
    // Older servers only speak SSE; try that before giving up.
    try {
      await client.connect(new SSEClientTransport(url, { requestInit: { headers } }));
    } catch {
      throw e;
    }
  }
  return client;
}

export function slugToolName(serverSlug: string, tool: string) {
  return `mcp_${serverSlug}_${tool}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 64);
}

export async function discoverTools(serverId: string) {
  const server = await prisma.mcpServer.findUnique({ where: { id: serverId } });
  if (!server) throw new Error("Server not found");
  const client = await connectMcp(server);
  try {
    const res = await client.listTools();
    const tools = res.tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema as Record<string, unknown> }));
    await prisma.mcpServer.update({ where: { id: serverId }, data: { toolsCache: tools as unknown as Prisma.InputJsonValue, toolsCachedAt: new Date(), status: "healthy", lastError: null } });
    return tools;
  } catch (e) {
    await prisma.mcpServer.update({ where: { id: serverId }, data: { status: "error", lastError: (e as Error).message } });
    throw e;
  } finally {
    await client.close().catch(() => null);
  }
}

export async function mcpToolsForUser(tier: Tier): Promise<McpToolDef[]> {
  const servers = await prisma.mcpServer.findMany({ where: { enabled: true } });
  const out: McpToolDef[] = [];
  for (const srv of servers) {
    const allowedTiers = srv.enabledForTiers.length ? srv.enabledForTiers : ["OWNER", "LEADERSHIP"];
    const minRank = Math.min(...allowedTiers.map((t) => TIER_RANK[t as Tier] ?? 99));
    if ((TIER_RANK[tier] ?? 0) < minRank) continue;
    const cached = (srv.toolsCache as { name: string; description: string; inputSchema: Record<string, unknown> }[] | null) ?? [];
    for (const t of cached) {
      if (srv.allowedTools.length && !srv.allowedTools.includes(t.name)) continue;
      out.push({ name: slugToolName(srv.slug, t.name), remoteName: t.name, serverId: srv.id, serverName: srv.name, description: `[${srv.name}] ${t.description}`.slice(0, 1000), inputSchema: t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object", properties: {} } });
    }
  }
  return out;
}

export async function callMcpTool(params: { serverId: string; tool: string; args: Record<string, unknown>; userId?: string | null }): Promise<unknown> {
  const server = await prisma.mcpServer.findUnique({ where: { id: params.serverId } });
  if (!server || !server.enabled) throw new Error("MCP server is not available");
  if (server.allowedTools.length && !server.allowedTools.includes(params.tool)) throw new Error(`Tool ${params.tool} is not allowed on ${server.name}`);
  const started = Date.now();
  const client = await connectMcp(server);
  try {
    const res = await Promise.race([
      client.callTool({ name: params.tool, arguments: params.args }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("MCP tool timed out after 60 seconds")), 60000)),
    ]);
    const content = (res as { content?: { type: string; text?: string }[] }).content ?? [];
    const text = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
    const structured = (res as { structuredContent?: unknown }).structuredContent;
    const isError = !!(res as { isError?: boolean }).isError;
    await prisma.mcpToolCall.create({ data: { serverId: server.id, serverName: server.name, tool: params.tool, userId: params.userId ?? undefined, args: params.args as object, resultSummary: text.slice(0, 300), ok: !isError, error: isError ? text.slice(0, 500) : null, durationMs: Date.now() - started } }).catch(() => null);
    if (isError) throw new Error(text || "Tool returned an error");
    return structured ?? text;
  } catch (e) {
    await prisma.mcpToolCall.create({ data: { serverId: server.id, serverName: server.name, tool: params.tool, userId: params.userId ?? undefined, args: params.args as object, ok: false, error: (e as Error).message.slice(0, 500), durationMs: Date.now() - started } }).catch(() => null);
    throw e;
  } finally {
    await client.close().catch(() => null);
  }
}
