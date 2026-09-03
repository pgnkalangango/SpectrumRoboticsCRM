"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { ProviderDot, POST_STATUS_LABEL, type PostRow } from "@/components/hq/marketing/shared";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseKey(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function postDate(p: PostRow): string | null {
  return p.publishedAt ?? p.scheduledAt;
}

export function ContentCalendar({ posts, view, date, canDraft }: { posts: PostRow[]; view: "month" | "week"; date: string; canDraft: boolean }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const anchor = parseKey(date);
  const today = dateKey(new Date());

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    return `${pathname}?${next}`;
  };

  const byDay = React.useMemo(() => {
    const map = new Map<string, PostRow[]>();
    for (const p of posts) {
      const d = postDate(p);
      if (!d) continue;
      const k = dateKey(new Date(d));
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(postDate(a)!).getTime() - new Date(postDate(b)!).getTime());
    return map;
  }, [posts]);

  const prev = view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1) : addDays(anchor, -7);
  const next = view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) : addDays(anchor, 7);
  const weekStart = addDays(anchor, -anchor.getDay());
  const title = view === "month" ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}` : `Week of ${MONTHS[weekStart.getMonth()].slice(0, 3)} ${weekStart.getDate()}${weekStart.getFullYear() !== new Date().getFullYear() ? `, ${weekStart.getFullYear()}` : ""}`;

  return (
    <div className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Link href={href({ date: dateKey(prev) })} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={href({ date: dateKey(next) })} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Next">
            <ChevronRight className="size-4" />
          </Link>
          <Link href={href({ date: null })} className="ml-1 rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2">
            Today
          </Link>
          <h2 className="ml-3 font-display text-[15px] font-semibold text-ink">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            <Link href={href({ view: "month" })} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold", view === "month" ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-muted hover:text-ink")}>
              <CalendarDays className="size-3.5" /> Month
            </Link>
            <Link href={href({ view: "week" })} className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold", view === "week" ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-muted hover:text-ink")}>
              <List className="size-3.5" /> Week
            </Link>
          </div>
        </div>
      </div>
      {view === "month" ? <MonthGrid anchor={anchor} byDay={byDay} today={today} href={href} canDraft={canDraft} /> : <WeekList weekStart={weekStart} byDay={byDay} today={today} href={href} canDraft={canDraft} />}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-ok" /> Published</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-info" /> Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-warn" /> Waiting for approval or approved</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-bad" /> Failed</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-line-strong" /> Draft with a date</span>
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  PUBLISHED: "border-l-ok bg-ok-soft/50 hover:bg-ok-soft",
  PUBLISHING: "border-l-info bg-info-soft/50 hover:bg-info-soft",
  SCHEDULED: "border-l-info bg-info-soft/50 hover:bg-info-soft",
  APPROVED: "border-l-warn bg-warn-soft/50 hover:bg-warn-soft",
  PENDING_APPROVAL: "border-l-warn bg-warn-soft/50 hover:bg-warn-soft",
  FAILED: "border-l-bad bg-bad-soft/50 hover:bg-bad-soft",
  DRAFT: "border-l-line-strong bg-surface-2 hover:bg-surface-3",
};

function PostChip({ post, href, showTime }: { post: PostRow; href: string; showTime?: boolean }) {
  const d = postDate(post);
  const time = d ? new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const providers = [...new Set(post.targets.map((t) => t.provider))];
  return (
    <Link href={href} className={cn("group flex items-center gap-1.5 rounded-md border-l-2 px-1.5 py-1 text-[11.5px] leading-tight transition-colors", TONE[post.status] ?? TONE.DRAFT)} title={`${POST_STATUS_LABEL[post.status] ?? post.status} · ${post.title ?? post.body.slice(0, 80)}`}>
      <span className="flex shrink-0 items-center -space-x-0.5">
        {providers.length ? providers.map((p) => <ProviderDot key={p} provider={p} size={7} className="ring-1 ring-surface" />) : <ProviderDot provider="NONE" size={7} />}
      </span>
      {showTime && time ? <span className="shrink-0 tabular text-muted">{time}</span> : null}
      <span className="truncate font-medium text-ink">{post.title ?? post.body}</span>
    </Link>
  );
}

function MonthGrid({ anchor, byDay, today, href, canDraft }: { anchor: Date; byDay: Map<string, PostRow[]>; today: string; href: (p: Record<string, string | null>) => string; canDraft: boolean }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const MAX = 3;
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line bg-surface-2/60 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = dateKey(d);
          const inMonth = d.getMonth() === anchor.getMonth();
          const items = byDay.get(key) ?? [];
          const isToday = key === today;
          return (
            <div key={key} className={cn("group relative min-h-[104px] border-b border-r border-line p-1.5", i % 7 === 6 && "border-r-0", i >= 35 && "border-b-0", !inMonth && "bg-surface-2/40")}>
              <div className="mb-1 flex items-center justify-between">
                <span className={cn("flex size-6 items-center justify-center rounded-full text-xs tabular", isToday ? "bg-brand font-bold text-white" : inMonth ? "font-semibold text-ink" : "text-faint")}>{d.getDate()}</span>
                {canDraft ? (
                  <Link href={href({ new: "1", date: key })} className="rounded p-0.5 text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-brand group-hover:opacity-100 focus:opacity-100" aria-label={`New post on ${key}`}>
                    <Plus className="size-3.5" />
                  </Link>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                {items.slice(0, MAX).map((p) => (
                  <PostChip key={p.id} post={p} href={href({ open: p.id })} />
                ))}
                {items.length > MAX ? (
                  <Link href={href({ view: "week", date: key })} className="px-1 text-[11px] font-semibold text-brand hover:underline">
                    +{items.length - MAX} more
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekList({ weekStart, byDay, today, href, canDraft }: { weekStart: Date; byDay: Map<string, PostRow[]>; today: string; href: (p: Record<string, string | null>) => string; canDraft: boolean }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <ul className="divide-y divide-line">
      {days.map((d) => {
        const key = dateKey(d);
        const items = byDay.get(key) ?? [];
        const isToday = key === today;
        return (
          <li key={key} className={cn("grid gap-3 px-3 py-3 sm:grid-cols-[140px_1fr]", isToday && "bg-brand-mist/60 dark:bg-brand-tint/30")}>
            <div className="flex items-start gap-2">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm tabular", isToday ? "bg-brand font-bold text-white" : "bg-surface-2 font-semibold text-ink")}>{d.getDate()}</span>
              <div>
                <div className="text-[13px] font-semibold text-ink">{DAY_NAMES[d.getDay()]}{isToday ? " · Today" : ""}</div>
                <div className="text-[11px] text-muted">{MONTHS[d.getMonth()].slice(0, 3)} {d.getDate()}</div>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              {items.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-faint">
                  Nothing planned
                  {canDraft ? (
                    <Link href={href({ new: "1", date: key })} className="flex items-center gap-0.5 font-semibold text-brand hover:underline">
                      <Plus className="size-3" /> Add a post
                    </Link>
                  ) : null}
                </div>
              ) : (
                items.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <PostChip post={p} href={href({ open: p.id })} showTime />
                    </div>
                    <StatusBadge value={p.status} labelOverride={POST_STATUS_LABEL[p.status]} className="hidden sm:inline-flex" />
                  </div>
                ))
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
