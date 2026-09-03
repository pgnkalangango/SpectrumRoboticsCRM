import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { appUrl } from "@/lib/mailer";
import { PageHeader } from "@/components/ui/empty-state";
import { McpView } from "@/components/hq/mcp/mcp-view";

export const metadata = { title: "MCP" };

export default async function McpPage() {
  const user = await requireStaff("LEADERSHIP");
  const manage = can(user, "integrations.manage");
  const [servers, keys, calls] = await Promise.all([
    prisma.mcpServer.findMany({ orderBy: { name: "asc" } }),
    prisma.apiKey.findMany({ where: user.tier === "OWNER" ? {} : { userId: user.id }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } }),
    prisma.mcpToolCall.findMany({ orderBy: { createdAt: "desc" }, take: 60, include: { user: { select: { name: true } } } }),
  ]);
  return (
    <div>
      <PageHeader title="MCP" subtitle="Two directions. Outside tools plug into the assistant through the gateway. Claude Desktop and Claude Code plug into HQ with a personal key." />
      <McpView
        canManage={manage}
        endpoint={appUrl("/api/mcp")}
        servers={servers.map((s) => ({ id: s.id, name: s.name, slug: s.slug, url: s.url, transport: s.transport, authType: s.authType, secretEnvName: s.secretEnvName, hasSecret: !!s.secretValue, headersJson: s.headers ? JSON.stringify(s.headers, null, 2) : "", allowedTools: s.allowedTools, enabledForTiers: s.enabledForTiers, enabled: s.enabled, status: s.status, lastError: s.lastError, description: s.description, tools: ((s.toolsCache as { name: string; description: string }[] | null) ?? []).map((t) => ({ name: t.name, description: t.description })), toolsCachedAt: s.toolsCachedAt?.toISOString() ?? null }))}
        keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, owner: k.user.name, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, expiresAt: k.expiresAt?.toISOString() ?? null, revokedAt: k.revokedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() }))}
        calls={calls.map((c) => ({ id: c.id, server: c.serverName, tool: c.tool, user: c.user?.name ?? null, ok: c.ok, error: c.error, summary: c.resultSummary, ms: c.durationMs, at: c.createdAt.toISOString() }))}
        tier={user.tier}
      />
    </div>
  );
}
