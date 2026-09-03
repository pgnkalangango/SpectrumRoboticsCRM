"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationsRead } from "@/server/actions/shell";

export type NotificationRow = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

const TYPE_TONE: Record<string, "default" | "brand" | "ok" | "warn" | "bad" | "info"> = { task: "info", approval: "warn", ticket: "bad", deal: "ok", mention: "brand", system: "default", info: "default" };

export function NotificationsList({ rows }: { rows: NotificationRow[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const unread = rows.filter((r) => !r.readAt).length;
  const shown = filter === "unread" ? rows.filter((r) => !r.readAt) : rows;
  const markOne = (id: string) =>
    start(async () => {
      await markNotificationsRead([id]);
      router.refresh();
    });
  const markAll = () =>
    start(async () => {
      await markNotificationsRead();
      toast.success("All caught up");
      router.refresh();
    });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-surface p-0.5">
          {(["all", "unread"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-md px-2.5 py-1 text-xs font-semibold capitalize", filter === f ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-muted hover:text-ink")}>
              {f} {f === "unread" ? `(${unread})` : `(${rows.length})`}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={markAll} disabled={pending || unread === 0}>
          <CheckCheck /> Mark all read
        </Button>
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={Bell} title={filter === "unread" ? "No unread notifications" : "No notifications yet"} body="Tasks, approvals, tickets and deal updates that need you will show up here." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          {shown.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-3 px-4 py-3", !n.readAt && "bg-brand-tint/20")}>
              <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {n.link ? (
                    <Link href={n.link} onClick={() => !n.readAt && markNotificationsRead([n.id]).catch(() => null)} className="text-sm font-medium text-ink hover:text-brand">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-ink">{n.title}</span>
                  )}
                  <Badge variant={TYPE_TONE[n.type] ?? "default"}>{n.type}</Badge>
                </div>
                {n.body ? <p className="mt-0.5 text-[13px] text-muted">{n.body}</p> : null}
                <div className="mt-1 text-[11px] text-faint" title={fmtDateTime(n.createdAt)}>
                  {relTime(n.createdAt)}
                  {n.readAt ? ` · read ${relTime(n.readAt)}` : ""}
                </div>
              </div>
              {!n.readAt ? (
                <Button size="sm" variant="ghost" onClick={() => markOne(n.id)} disabled={pending}>
                  <Check /> Mark read
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
