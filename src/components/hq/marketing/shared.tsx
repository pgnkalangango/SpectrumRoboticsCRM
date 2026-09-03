"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LinkedinIcon } from "@/components/hq/icons";

// Serialized shapes shared by the marketing pages and client components.
export type PostTargetRow = { id: string; accountId: string; accountName: string; provider: string; status: string; externalUrl: string | null; error: string | null; publishedAt: string | null };
export type PostRow = {
  id: string;
  title: string | null;
  body: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  mediaUrls: string[];
  linkUrl: string | null;
  campaignId: string | null;
  campaignName: string | null;
  canvaDesignId: string | null;
  authorId: string | null;
  authorName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  notes: string | null;
  claimsBlocked: boolean;
  claimsWarnings: number;
  targets: PostTargetRow[];
};
export type AccountOption = { id: string; provider: string; name: string; handle: string | null; status: string };
export type HistoryRow = { id: string; action: string; actor: string; at: string; note: string | null };

export const PROVIDER_META: Record<string, { label: string; short: string; color: string; limit: number }> = {
  LINKEDIN: { label: "LinkedIn", short: "in", color: "#0A66C2", limit: 3000 },
  FACEBOOK: { label: "Facebook", short: "f", color: "#1877F2", limit: 63206 },
  INSTAGRAM: { label: "Instagram", short: "ig", color: "#C13584", limit: 2200 },
  TIKTOK: { label: "TikTok", short: "tt", color: "#111111", limit: 2200 },
  YOUTUBE: { label: "YouTube", short: "yt", color: "#FF0000", limit: 5000 },
};

export function providerLabel(p: string): string {
  return PROVIDER_META[p]?.label ?? p;
}

export function ProviderDot({ provider, size = 8, className }: { provider: string; size?: number; className?: string }) {
  return <span className={cn("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, background: PROVIDER_META[provider]?.color ?? "var(--muted)" }} aria-label={providerLabel(provider)} />;
}

export function ProviderChip({ provider, name, className, muted }: { provider: string; name?: string; className?: string; muted?: boolean }) {
  const meta = PROVIDER_META[provider];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink-2", muted && "opacity-60", className)} title={name ? `${meta?.label ?? provider}: ${name}` : meta?.label}>
      {provider === "LINKEDIN" ? <LinkedinIcon className="size-3" /> : <ProviderDot provider={provider} />}
      {name ?? meta?.label ?? provider}
    </span>
  );
}

export const POST_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Waiting for approval",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  FAILED: "Failed",
};

export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
