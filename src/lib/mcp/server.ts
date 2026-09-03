import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/crypto";
import { toolsForScopes, type ToolContext, type ToolScope } from "@/lib/ai/tools";

// Spectrum HQ as an MCP server (Streamable HTTP, stateless JSON responses). Claude Desktop, Claude Code
// or any MCP client connects with a personal access key and gets the same tools the assistant uses,
// limited to the key's scopes and running as the key's owner.
export const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "spectrum-hq", version: "1.0.0" };

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type JsonRpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export async function authenticateKey(authHeader: string | null): Promise<{ ctx: ToolContext; keyId: string } | null> {
  const m = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const key = await prisma.apiKey.findUnique({ where: { hashedKey: sha256(m[1].trim()) }, include: { user: { select: { id: true, email: true, name: true, tier: true, kind: true, status: true } } } });
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) return null;
  if (key.user.kind !== "STAFF" || key.user.status !== "ACTIVE") return null;
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => null);
  return { keyId: key.id, ctx: { userId: key.user.id, email: key.user.email, name: key.user.name, tier: key.user.tier, scopes: key.scopes as ToolScope[] } };
}

export async function handleJsonRpc(req: JsonRpcRequest, ctx: ToolContext): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string, data?: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message, data } });
  const tools = toolsForScopes(ctx.scopes);
  switch (req.method) {
    case "initialize":
      return ok({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: `Spectrum HQ tools for ${ctx.name}. Read tools search the CRM, SOPs and this person's own mailbox and calendar. Write tools (create_task, log_note, create_calendar_event) are available only when the key has write scope.` });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) });
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = ((req.params?.arguments as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const tool = tools.find((t) => t.name === name);
      if (!tool) return err(-32602, `Unknown tool: ${name}`);
      const started = Date.now();
      try {
        const result = await tool.run(args, ctx);
        const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        await prisma.mcpToolCall.create({ data: { serverName: "spectrum-hq", tool: name, userId: ctx.userId, args: args as object, resultSummary: text.slice(0, 300), ok: true, durationMs: Date.now() - started } }).catch(() => null);
        return ok({ content: [{ type: "text", text }], isError: false });
      } catch (e) {
        await prisma.mcpToolCall.create({ data: { serverName: "spectrum-hq", tool: name, userId: ctx.userId, args: args as object, ok: false, error: (e as Error).message.slice(0, 500), durationMs: Date.now() - started } }).catch(() => null);
        return ok({ content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true });
      }
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return err(-32601, `Method not found: ${req.method}`);
  }
}
