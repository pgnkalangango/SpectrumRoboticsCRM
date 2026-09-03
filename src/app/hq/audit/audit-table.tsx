"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn, fmtDateTime, label } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type AuditRow = { id: string; action: string; entityType: string; entityId: string | null; actor: { name: string; image: string | null; avatarColor: string | null } | null; actorEmail: string | null; before: unknown; after: unknown; createdAt: string };

const ACTION_TONE: Record<string, "default" | "ok" | "warn" | "bad" | "info" | "brand"> = {
  create: "ok",
  invite: "ok",
  client_invite: "ok",
  publish: "ok",
  signup_approved: "ok",
  reactivate: "ok",
  update: "info",
  settings_update: "info",
  profile_update: "info",
  sop_new_version: "info",
  delete: "bad",
  deactivate: "bad",
  signup_denied: "bad",
  archive: "warn",
  permission_change: "warn",
  tier_change: "warn",
  password_reset_sent: "warn",
  password_change: "warn",
  export: "brand",
  import: "brand",
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function show(v: unknown): string {
  if (v === undefined) return "";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>When</TableHead>
          <TableHead>Who</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Record</TableHead>
          <TableHead>Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const has = r.before !== null || r.after !== null;
          const isOpen = !!open[r.id];
          const summary = summarize(r.before, r.after);
          return (
            <React.Fragment key={r.id}>
              <TableRow clickable={has} onClick={() => has && setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}>
                <TableCell className="text-muted">{has ? isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" /> : null}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted">{fmtDateTime(r.createdAt)}</TableCell>
                <TableCell>
                  {r.actor ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <Avatar name={r.actor.name} src={r.actor.image} color={r.actor.avatarColor} size={20} /> {r.actor.name}
                    </span>
                  ) : (
                    <span className="text-sm text-muted">{r.actorEmail ?? "System"}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={ACTION_TONE[r.action] ?? "default"}>{label(r.action)}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  <span className="text-ink">{label(r.entityType)}</span>
                  {r.entityId ? <span className="ml-1.5 font-mono text-[11px] text-faint">{r.entityId.slice(0, 10)}</span> : null}
                </TableCell>
                <TableCell className="max-w-md truncate text-xs text-muted">{summary}</TableCell>
              </TableRow>
              {isOpen ? (
                <TableRow>
                  <TableCell colSpan={6} className="bg-surface-2/50 p-0">
                    <Diff before={r.before} after={r.after} />
                  </TableCell>
                </TableRow>
              ) : null}
            </React.Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

function summarize(before: unknown, after: unknown): string {
  if (isObj(before) && isObj(after)) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((k) => show(before[k]) !== show(after[k]));
    return keys.length ? `Changed ${keys.slice(0, 5).join(", ")}${keys.length > 5 ? ` and ${keys.length - 5} more` : ""}` : "No field changes";
  }
  if (isObj(after)) return Object.entries(after).slice(0, 4).map(([k, v]) => `${k}: ${show(v).slice(0, 40)}`).join(" · ");
  if (isObj(before)) return `Removed: ${Object.keys(before).slice(0, 5).join(", ")}`;
  if (after !== null && after !== undefined) return show(after).slice(0, 120);
  return "";
}

function Diff({ before, after }: { before: unknown; after: unknown }) {
  if (isObj(before) || isObj(after)) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
    return (
      <div className="overflow-x-auto px-4 py-3">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              <th className="w-44 pb-1.5 pr-3">Field</th>
              <th className="pb-1.5 pr-3">Before</th>
              <th className="pb-1.5">After</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const changed = show(b[k]) !== show(a[k]);
              return (
                <tr key={k} className={cn("border-t border-line align-top", changed && "bg-warn-soft/30")}>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-ink-2">{k}</td>
                  <td className={cn("py-1.5 pr-3 whitespace-pre-wrap break-all", changed ? "text-bad line-through decoration-bad/40" : "text-muted")}>{k in b ? show(b[k]) : <span className="text-faint">(none)</span>}</td>
                  <td className={cn("py-1.5 whitespace-pre-wrap break-all", changed ? "font-medium text-ok" : "text-muted")}>{k in a ? show(a[k]) : <span className="text-faint">(none)</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-2">
      <div>
        <div className="eyebrow mb-1">Before</div>
        <pre className="whitespace-pre-wrap break-all rounded-md border border-line bg-surface p-2 font-mono text-[11px]">{before === null || before === undefined ? "(none)" : JSON.stringify(before, null, 2)}</pre>
      </div>
      <div>
        <div className="eyebrow mb-1">After</div>
        <pre className="whitespace-pre-wrap break-all rounded-md border border-line bg-surface p-2 font-mono text-[11px]">{after === null || after === undefined ? "(none)" : JSON.stringify(after, null, 2)}</pre>
      </div>
    </div>
  );
}
