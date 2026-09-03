"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, FlaskConical, Link2, Network, Plug, Unplug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Checkbox, Switch } from "@/components/ui/misc";
import { cn, relTime } from "@/lib/utils";
import { TIER_LABELS } from "@/lib/permissions";
import { disconnectSocial, setIntegrationDisabled, setIntegrationTiers, testIntegration } from "@/server/actions/integrations";
import type { Tier } from "@/generated/prisma/enums";

export type IntegrationCardData = {
  id: string;
  key: string;
  name: string;
  purpose: string;
  category: string;
  mechanism: string;
  mechanismLabel: string;
  scope: string;
  scopeLabel: string;
  status: string;
  secrets: { name: string; present: boolean }[];
  enabledForTiers: Tier[];
  rolloutOrder: number;
  lastSyncAt: string | null;
  lastError: string | null;
  action: { kind: "oauth" | "inbox" | "mcp" | "none"; href?: string; label?: string };
  testable: boolean;
  accounts: { id: string; provider: string; name: string; handle: string | null; status: string }[];
};

const TIERS: Tier[] = ["OWNER", "LEADERSHIP", "EMPLOYEE"];

export function IntegrationCard({ item }: { item: IntegrationCardData }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [testing, setTesting] = React.useState(false);
  const disabled = item.status === "DISABLED";
  const secretsOk = item.secrets.length === 0 || item.secrets.every((s) => s.present);

  const toggleTier = (tier: Tier, on: boolean) => {
    const next = on ? [...new Set([...item.enabledForTiers, tier])] : item.enabledForTiers.filter((t) => t !== tier);
    start(async () => {
      const r = await setIntegrationTiers(item.key, next);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  };
  const toggleDisabled = (on: boolean) =>
    start(async () => {
      const r = await setIntegrationDisabled(item.key, !on);
      if (r.ok) {
        toast.success(on ? `${item.name} enabled` : `${item.name} disabled`);
        router.refresh();
      } else toast.error(r.error);
    });
  const test = async () => {
    setTesting(true);
    const r = await testIntegration(item.key);
    setTesting(false);
    if (r.ok) toast.success(r.data?.message ?? "Test passed");
    else toast.error(r.error);
    router.refresh();
  };
  const disconnect = () => {
    if (!confirm(`Disconnect ${item.name}? Scheduled posts to these accounts will fail until it is reconnected.`)) return;
    start(async () => {
      const r = await disconnectSocial(item.key === "meta" ? "META" : "LINKEDIN");
      if (r.ok) {
        toast.success("Disconnected");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <article className={cn("flex flex-col rounded-xl border border-line bg-surface shadow-sm", disabled && "opacity-70")}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-semibold text-ink">{item.name}</h3>
            <StatusBadge value={item.status} />
          </div>
          <p className="mt-0.5 text-[13px] text-muted">{item.purpose}</p>
        </div>
        <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted" title="Rollout order">
          #{item.rolloutOrder}
        </span>
      </header>
      <div className="flex flex-1 flex-col gap-3 px-4 py-3 text-[13px]">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{item.mechanismLabel}</Badge>
          <Badge variant="outline">{item.scopeLabel}</Badge>
        </div>
        <div>
          <div className="eyebrow mb-1">Secrets</div>
          {item.secrets.length === 0 ? (
            <p className="text-xs text-muted">No secrets needed. Configured through the MCP gateway.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {item.secrets.map((s) => (
                <li key={s.name} className="flex items-center gap-1.5 font-mono text-[11.5px]">
                  {s.present ? <Check className="size-3.5 text-ok" /> : <X className="size-3.5 text-bad" />}
                  <span className={s.present ? "text-ink-2" : "text-ink"}>{s.name}</span>
                  {!s.present ? <span className="font-sans text-[11px] text-bad">missing</span> : null}
                </li>
              ))}
            </ul>
          )}
          {!secretsOk ? <p className="mt-1 text-xs text-muted">Not configured. Add the missing secrets to the environment and restart.</p> : null}
        </div>
        {item.accounts.length ? (
          <div>
            <div className="eyebrow mb-1">Connected accounts</div>
            <ul className="flex flex-col gap-0.5 text-xs text-ink-2">
              {item.accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", a.status === "connected" ? "bg-ok" : "bg-line-strong")} />
                  {a.name}
                  <span className="text-muted">
                    {a.provider.toLowerCase()}
                    {a.handle ? ` · @${a.handle}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="eyebrow">Last sync</div>
            <div className="text-ink-2">{item.lastSyncAt ? relTime(item.lastSyncAt) : "Never"}</div>
          </div>
          <div>
            <div className="eyebrow">Last error</div>
            <div className={cn("truncate", item.lastError ? "text-bad" : "text-ink-2")} title={item.lastError ?? undefined}>
              {item.lastError ?? "None"}
            </div>
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1">Available to</div>
          <div className="flex flex-wrap gap-3">
            {TIERS.map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
                <Checkbox checked={item.enabledForTiers.includes(t)} disabled={pending} onCheckedChange={(v) => toggleTier(t, v === true)} /> {TIER_LABELS[t]}
              </label>
            ))}
          </div>
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <label className="flex items-center gap-2 text-xs text-ink-2">
          <Switch checked={!disabled} disabled={pending} onCheckedChange={toggleDisabled} /> {disabled ? "Disabled" : "Enabled"}
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.testable ? (
            <Button variant="secondary" size="sm" onClick={test} loading={testing} disabled={disabled || (item.secrets.length > 0 && !secretsOk && item.mechanism !== "oauth")}>
              <FlaskConical /> Test
            </Button>
          ) : null}
          {item.action.kind === "oauth" && item.action.href ? (
            <>
              {item.status === "CONNECTED" && (item.key === "linkedin" || item.key === "meta") ? (
                <Button variant="ghost" size="sm" onClick={disconnect} disabled={pending}>
                  <Unplug /> Disconnect
                </Button>
              ) : null}
              {secretsOk ? (
                <Button asChild size="sm" variant={item.status === "CONNECTED" ? "secondary" : "default"}>
                  <a href={item.action.href}>
                    <Plug /> {item.status === "CONNECTED" ? "Reconnect" : item.action.label ?? "Connect"}
                  </a>
                </Button>
              ) : (
                <Button size="sm" disabled title="Add the secrets first">
                  <Plug /> {item.action.label ?? "Connect"}
                </Button>
              )}
            </>
          ) : null}
          {item.action.kind === "inbox" ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={item.action.href ?? "/hq/inbox"}>
                <Link2 /> {item.action.label ?? "Each person connects from Inbox"}
              </Link>
            </Button>
          ) : null}
          {item.action.kind === "mcp" ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={item.action.href ?? "/hq/mcp"}>
                <Network /> {item.action.label ?? "Connected through the MCP gateway"} <ExternalLink className="size-3" />
              </Link>
            </Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
