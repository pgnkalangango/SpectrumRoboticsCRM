import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt } from "@/lib/ai/system";
import { toolsForScopes, type HqTool, type ToolContext, type ToolScope } from "@/lib/ai/tools";
import { mcpToolsForUser, callMcpTool, type McpToolDef } from "@/lib/mcp/gateway";

export type TraceEntry = { tool: string; summary: string; ok: boolean; ms: number };
export type AssistantResult = { answer: string; trace: TraceEntry[]; model: string; usage: { input: number; output: number; cacheRead: number }; refused?: boolean };
export type ChatMessage = { role: "user" | "assistant"; content: string };

function summarize(result: unknown): string {
  if (result === null || result === undefined) return "no result";
  if (Array.isArray(result)) return `${result.length} item${result.length === 1 ? "" : "s"}`;
  if (typeof result === "object") {
    const o = result as Record<string, unknown>;
    if ("error" in o) return String(o.error);
    const keys = Object.keys(o).slice(0, 4);
    return keys.map((k) => (Array.isArray(o[k]) ? `${k}: ${(o[k] as unknown[]).length}` : k)).join(", ");
  }
  return String(result).slice(0, 80);
}

export function assistantConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Manual tool loop: the model asks for tools, we run them as the signed in person, and repeat
// until it answers. Every tool call is recorded in the trace shown under the answer.
export async function runAssistant(params: { userId: string; messages: ChatMessage[]; mode?: "chat" | "draft_reply"; scopes?: ToolScope[]; maxRounds?: number; contextNote?: string }): Promise<AssistantResult> {
  if (!assistantConfigured()) throw new Error("The assistant is not configured yet. An owner needs to add ANTHROPIC_API_KEY on the server.");
  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { id: true, email: true, name: true, tier: true } });
  if (!user) throw new Error("User not found");
  const scopes = params.scopes ?? ["read", "draft", "write"];
  const ctx: ToolContext = { userId: user.id, email: user.email, name: user.name, tier: user.tier, scopes };
  const hqTools = toolsForScopes(scopes);
  let mcpTools: McpToolDef[] = [];
  try {
    mcpTools = await mcpToolsForUser(user.tier);
  } catch {
    mcpTools = [];
  }
  const { stable, personal, model, maxTokens } = await buildSystemPrompt(user.id, { mode: params.mode, mcpToolNames: mcpTools.map((t) => t.name) });

  const client = new Anthropic();
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...hqTools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema })),
    ...mcpTools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema })),
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = params.messages.map((m) => ({ role: m.role, content: m.content }));
  if (params.contextNote && messages.length && messages[messages.length - 1].role === "user") {
    const last = messages[messages.length - 1];
    last.content = `${params.contextNote}\n\n${typeof last.content === "string" ? last.content : ""}`;
  }
  const trace: TraceEntry[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  const maxRounds = params.maxRounds ?? 8;
  let finalText = "";
  let refused = false;

  for (let round = 0; round < maxRounds; round++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: personal },
      ],
      tools,
      messages,
    });
    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      refused = true;
      finalText = "I cannot help with that request.";
      break;
    }
    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      finalText = text;
      break;
    }
    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const started = Date.now();
        const args = (tu.input ?? {}) as Record<string, unknown>;
        try {
          let result: unknown;
          const local: HqTool | undefined = hqTools.find((t) => t.name === tu.name);
          if (local) result = await local.run(args, ctx);
          else {
            const remote = mcpTools.find((t) => t.name === tu.name);
            if (!remote) throw new Error(`Unknown tool ${tu.name}`);
            result = await callMcpTool({ serverId: remote.serverId, tool: remote.remoteName, args, userId: user.id });
          }
          trace.push({ tool: tu.name, summary: summarize(result), ok: true, ms: Date.now() - started });
          const text = typeof result === "string" ? result : JSON.stringify(result, null, 0);
          return { type: "tool_result", tool_use_id: tu.id, content: text.slice(0, 60000) };
        } catch (e) {
          trace.push({ tool: tu.name, summary: (e as Error).message, ok: false, ms: Date.now() - started });
          return { type: "tool_result", tool_use_id: tu.id, content: `Error: ${(e as Error).message}`, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
    if (round === maxRounds - 1) finalText = text || "I ran out of steps before finishing. Ask me to continue.";
  }
  return { answer: finalText.trim(), trace, model, usage, refused };
}

export function friendlyAssistantError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The assistant's API key is missing or invalid. An owner can fix this under Integrations.";
  if (e instanceof Anthropic.RateLimitError) return "The assistant is busy right now. Try again in a moment.";
  if (e instanceof Anthropic.BadRequestError) return `The assistant could not process that: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `Assistant error (${e.status}): ${e.message}`;
  return (e as Error)?.message || "Something went wrong.";
}
