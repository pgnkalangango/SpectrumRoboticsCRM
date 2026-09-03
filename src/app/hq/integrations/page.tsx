import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/empty-state";
import { IntegrationCard, type IntegrationCardData } from "@/components/hq/integrations/integration-card";

export const metadata = { title: "Integrations" };

const CATEGORY_ORDER = ["email", "calendar", "ai", "accounting", "payments", "social", "design", "media", "chat", "files", "other"];
const CATEGORY_LABEL: Record<string, string> = { email: "Email and calendar", calendar: "Calendar", ai: "AI", accounting: "Accounting", payments: "Payments", social: "Social", design: "Design", media: "Media generation", chat: "Chat", files: "Files", other: "Other" };
const MECHANISM_LABEL: Record<string, string> = { oauth: "OAuth sign in", api_key: "API key", mcp: "MCP gateway", webhook: "Webhook" };
const SCOPE_LABEL: Record<string, string> = { per_user: "Each person connects their own", shared: "Shared company account" };

const META: Record<string, { purpose: string; action: IntegrationCardData["action"]; testable?: boolean }> = {
  outlook: { purpose: "Reads and sends each person's mail, syncs their calendar, and logs threads to contacts.", action: { kind: "inbox", href: "/hq/inbox", label: "Each person connects from Inbox" } },
  google: { purpose: "Same as Microsoft 365 for people on Google Workspace.", action: { kind: "inbox", href: "/hq/inbox", label: "Each person connects from Inbox" } },
  anthropic: { purpose: "Powers the assistant, drafting and the proof and claims helpers.", action: { kind: "none" }, testable: true },
  quickbooks: { purpose: "Syncs customers, invoices and payments with the books.", action: { kind: "oauth", href: "/api/oauth/quickbooks/start", label: "Connect QuickBooks" } },
  stripe: { purpose: "Card and ACH payment links on invoices, with webhooks marking them paid.", action: { kind: "none" }, testable: true },
  linkedin: { purpose: "Publishes approved posts to the company page and lists the pages you administer.", action: { kind: "oauth", href: "/api/oauth/linkedin/start", label: "Connect LinkedIn" }, testable: true },
  meta: { purpose: "Publishes to the Facebook page and Instagram account and receives comments and messages.", action: { kind: "oauth", href: "/api/oauth/meta/start", label: "Connect Facebook" }, testable: true },
  canva: { purpose: "Designs and brand kit for social posts, exported through the MCP gateway.", action: { kind: "mcp", href: "/hq/mcp", label: "Connected through the MCP gateway" } },
  higgsfield: { purpose: "Video and image generation for campaigns.", action: { kind: "mcp", href: "/hq/mcp", label: "Connected through the MCP gateway" } },
  creatify: { purpose: "AI video ads from product pages.", action: { kind: "mcp", href: "/hq/mcp", label: "Connected through the MCP gateway" } },
  openart: { purpose: "Image generation for posts and decks.", action: { kind: "mcp", href: "/hq/mcp", label: "Connected through the MCP gateway" } },
  slack: { purpose: "Automation and digest messages into a company channel.", action: { kind: "none" }, testable: true },
};

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; accounts?: string }> }) {
  const user = await requireStaff("OWNER");
  if (!can(user, "integrations.manage")) redirect("/hq?denied=1");
  const sp = await searchParams;
  const [integrations, accounts, connections] = await Promise.all([
    prisma.integration.findMany({ orderBy: [{ rolloutOrder: "asc" }, { name: "asc" }] }),
    prisma.socialAccount.findMany({ orderBy: [{ provider: "asc" }, { name: "asc" }] }),
    prisma.connection.findMany({ where: { userId: null }, select: { provider: true, status: true, lastSyncAt: true, lastError: true, accountName: true } }),
  ]);

  const cards: IntegrationCardData[] = integrations.map((i) => {
    const meta = META[i.key] ?? { purpose: "", action: { kind: "none" as const } };
    const secrets = i.secretNames.map((name) => ({ name, present: !!process.env[name] }));
    const connection = i.key === "linkedin" ? connections.find((c) => c.provider === "LINKEDIN") : i.key === "meta" ? connections.find((c) => c.provider === "META") : i.key === "quickbooks" ? connections.find((c) => c.provider === "QUICKBOOKS") : undefined;
    // Live status: secrets and connections win over the stored row unless it was disabled or errored.
    let status = i.status;
    if (status !== "DISABLED" && status !== "ERROR") {
      if (i.mechanism === "oauth" && i.scope === "shared") status = connection?.status === "ACTIVE" ? "CONNECTED" : secrets.every((s) => s.present) && secrets.length ? "PENDING" : "NOT_CONFIGURED";
      else if (i.mechanism === "api_key" || i.mechanism === "webhook") status = secrets.length && secrets.every((s) => s.present) ? (status === "NOT_CONFIGURED" ? "CONNECTED" : status) : "NOT_CONFIGURED";
      else if (i.mechanism === "oauth" && i.scope === "per_user") status = secrets.every((s) => s.present) ? (status === "NOT_CONFIGURED" ? "PENDING" : status) : "NOT_CONFIGURED";
    }
    const own = i.key === "linkedin" ? accounts.filter((a) => a.provider === "LINKEDIN") : i.key === "meta" ? accounts.filter((a) => a.provider === "FACEBOOK" || a.provider === "INSTAGRAM") : [];
    return {
      id: i.id,
      key: i.key,
      name: i.name,
      purpose: meta.purpose,
      category: i.category,
      mechanism: i.mechanism,
      mechanismLabel: MECHANISM_LABEL[i.mechanism] ?? i.mechanism,
      scope: i.scope,
      scopeLabel: SCOPE_LABEL[i.scope] ?? i.scope,
      status,
      secrets,
      enabledForTiers: i.enabledForTiers,
      rolloutOrder: i.rolloutOrder,
      lastSyncAt: (i.lastSyncAt ?? connection?.lastSyncAt)?.toISOString() ?? null,
      lastError: i.lastError ?? connection?.lastError ?? null,
      action: meta.action,
      testable: !!meta.testable,
      accounts: own.map((a) => ({ id: a.id, provider: a.provider, name: a.name, handle: a.handle, status: a.status })),
    };
  });
  const groups = CATEGORY_ORDER.map((c) => ({ key: c, label: CATEGORY_LABEL[c] ?? c, items: cards.filter((i) => i.category === c) })).filter((g) => g.items.length > 0);
  const connected = cards.filter((c) => c.status === "CONNECTED").length;
  const errorText = sp.error === "owners_only" ? "Only owners can connect shared accounts." : sp.error === "state_mismatch" ? "The sign in did not complete. Please try again." : sp.error === "linkedin_not_configured" ? "LinkedIn is not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET first." : sp.error === "meta_not_configured" ? "Meta is not configured. Add META_APP_ID and META_APP_SECRET first." : sp.error ? decodeURIComponent(sp.error) : null;

  return (
    <div>
      <PageHeader title="Integrations" subtitle={`${connected} of ${cards.length} connected. Secrets live in the environment, never in the database. Roll out in the order shown.`} />
      {sp.connected ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-soft/60 px-4 py-2.5 text-sm text-ink">
          <CheckCircle2 className="size-4 text-ok" /> {sp.connected === "linkedin" ? "LinkedIn" : "Facebook and Instagram"} connected{sp.accounts ? `, ${sp.accounts} account${sp.accounts === "1" ? "" : "s"} available for posting` : ""}.
        </div>
      ) : null}
      {errorText ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-bad/30 bg-bad-soft/60 px-4 py-2.5 text-sm text-ink">
          <AlertTriangle className="size-4 text-bad" /> {errorText}
        </div>
      ) : null}
      <div className="flex flex-col gap-7">
        {groups.map((g) => (
          <section key={g.key}>
            <h2 className="eyebrow mb-2">{g.label}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((item) => (
                <IntegrationCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
