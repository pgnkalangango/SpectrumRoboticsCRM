"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, ClipboardCheck, Search, X } from "lucide-react";
import { cn, fmtDate } from "@/lib/utils";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { CATEGORY_TONE, SOP_CATEGORIES, categoryLabel } from "@/components/hq/sops/constants";

export type LibrarySop = {
  id: string;
  slug: string;
  code: string | null;
  title: string;
  summary: string | null;
  category: string;
  scope: "COMPANY" | "DEPARTMENT";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
  keywords: string[];
  tags: string[];
  appliesTo: string[];
  requiresAcknowledgment: boolean;
  reviewDate: string | null;
  updatedAt: string;
  department: { id: string; name: string; color: string } | null;
  stepCount: number;
  hasQuiz: boolean;
  acknowledgedVersion: number | null;
};
export type LibraryDepartment = { id: string; name: string; color: string };

type AckState = "acknowledged" | "needed" | "outdated" | "none";
function ackState(s: LibrarySop): AckState {
  if (!s.requiresAcknowledgment || s.status !== "PUBLISHED") return "none";
  if (s.acknowledgedVersion === s.version) return "acknowledged";
  if (s.acknowledgedVersion !== null) return "outdated";
  return "needed";
}

export function SopLibrary({ sops, departments, canEdit, initialQuery = "", initialDept = "", initialFilter = "" }: { sops: LibrarySop[]; departments: LibraryDepartment[]; canEdit: boolean; initialQuery?: string; initialDept?: string; initialFilter?: string }) {
  const [q, setQ] = React.useState(initialQuery);
  const [dept, setDept] = React.useState(initialDept);
  const [category, setCategory] = React.useState("");
  const [needsAck, setNeedsAck] = React.useState(initialFilter === "ack");
  const [status, setStatus] = React.useState(canEdit ? "" : "PUBLISHED");
  // Captured once so render stays pure; the page is server refreshed often enough for review dates.
  const [now] = React.useState(() => Date.now());

  const needle = q.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    return sops.filter((s) => {
      if (status && s.status !== status) return false;
      if (dept === "company" && s.department) return false;
      if (dept && dept !== "company" && s.department?.id !== dept) return false;
      if (category && s.category !== category) return false;
      if (needsAck) {
        const a = ackState(s);
        if (a !== "needed" && a !== "outdated") return false;
      }
      if (needle) {
        const hay = `${s.code ?? ""} ${s.title} ${s.summary ?? ""} ${s.keywords.join(" ")} ${s.tags.join(" ")}`.toLowerCase();
        if (!needle.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [sops, status, dept, category, needsAck, needle]);

  const groups = React.useMemo(() => {
    const map = new Map<string, { key: string; name: string; color: string | null; items: LibrarySop[] }>();
    const order = ["company", ...departments.map((d) => d.id)];
    for (const s of filtered) {
      const key = s.department?.id ?? "company";
      if (!map.has(key)) map.set(key, { key, name: s.department?.name ?? "Company wide", color: s.department?.color ?? null, items: [] });
      map.get(key)!.items.push(s);
    }
    return Array.from(map.values()).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [filtered, departments]);

  const needing = sops.filter((s) => ["needed", "outdated"].includes(ackState(s))).length;
  const reviewSoon = sops.filter((s) => s.status === "PUBLISHED" && s.reviewDate && new Date(s.reviewDate).getTime() < now + 30 * 86400000).length;
  const active = !!(q || dept || category || needsAck || (canEdit && status));

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Published" value={sops.filter((s) => s.status === "PUBLISHED").length} sub={`${departments.length} departments`} />
        <button type="button" onClick={() => setNeedsAck((v) => !v)} className={cn("rounded-xl border px-4 py-3 text-left shadow-sm transition-colors", needsAck ? "border-warn bg-warn-soft/50" : "border-line bg-surface hover:border-line-strong")}>
          <div className="eyebrow">Need my acknowledgment</div>
          <div className={cn("mt-1.5 font-display text-2xl font-bold leading-none tabular", needing ? "text-warn" : "text-ink")}>{needing}</div>
          <div className="mt-1.5 text-xs text-muted">{needing ? "Click to see only these" : "You are up to date"}</div>
        </button>
        <Stat label="Review due within 30 days" value={reviewSoon} sub={reviewSoon ? "Owners keep these fresh" : "Nothing due for review"} tone={reviewSoon ? "warn" : "default"} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, summary, keywords" className="pl-8" autoFocus />
        </div>
        <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto min-w-36" aria-label="Category">
          <option value="">All categories</option>
          {SOP_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
        {canEdit ? (
          <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36" aria-label="Status">
            <option value="">All statuses</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Drafts</option>
            <option value="ARCHIVED">Archived</option>
          </NativeSelect>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:border-line-strong">
          <input type="checkbox" className="accent-brand" checked={needsAck} onChange={(e) => setNeedsAck(e.target.checked)} /> Needs my acknowledgment
        </label>
        {active ? (
          <button
            className="flex items-center gap-1 text-xs text-muted hover:text-ink"
            onClick={() => {
              setQ("");
              setDept("");
              setCategory("");
              setNeedsAck(false);
              setStatus(canEdit ? "" : "PUBLISHED");
            }}
          >
            <X className="size-3.5" /> Clear
          </button>
        ) : null}
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        <DeptChip active={dept === ""} onClick={() => setDept("")} label="All departments" />
        <DeptChip active={dept === "company"} onClick={() => setDept("company")} label="Company wide" color="#4F6D7A" />
        {departments.map((d) => (
          <DeptChip key={d.id} active={dept === d.id} onClick={() => setDept(d.id)} label={d.name} color={d.color} count={sops.filter((s) => s.department?.id === d.id && (canEdit || s.status === "PUBLISHED")).length} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title={needsAck && !needle ? "Nothing waiting on you" : "No SOPs match"} body={needsAck && !needle ? "You have acknowledged every SOP that applies to you." : "Try a different word, or clear the filters."} />
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: g.color ?? "#4F6D7A" }} />
                <h2 className="font-display text-[15px] font-semibold text-ink">{g.name}</h2>
                <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">{g.items.length}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((s) => (
                  <SopCard key={s.id} sop={s} now={now} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone = "default" }: { label: string; value: number; sub?: string; tone?: "default" | "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1.5 font-display text-2xl font-bold leading-none tabular", tone === "warn" ? "text-warn" : "text-ink")}>{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

function DeptChip({ active, onClick, label, color, count }: { active: boolean; onClick: () => void; label: string; color?: string; count?: number }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors", active ? "border-ink bg-ink text-white dark:bg-surface-3 dark:text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink")}>
      {color ? <span className="size-2 rounded-full" style={{ background: color }} /> : null}
      {label}
      {typeof count === "number" ? <span className={cn("text-[11px]", active ? "text-white/70 dark:text-muted" : "text-muted")}>{count}</span> : null}
    </button>
  );
}

function SopCard({ sop, now }: { sop: LibrarySop; now: number }) {
  const a = ackState(sop);
  const reviewDue = sop.reviewDate && new Date(sop.reviewDate).getTime() < now;
  return (
    <Link href={`/hq/sops/${sop.slug}`} className={cn("group flex flex-col rounded-xl border bg-surface p-4 shadow-sm transition-all hover:-translate-y-px hover:border-brand/60 hover:shadow-md", a === "needed" || a === "outdated" ? "border-warn/50" : "border-line")}>
      <div className="flex items-center gap-2">
        {sop.code ? <span className="font-mono text-[11.5px] font-semibold tracking-wide text-muted">{sop.code}</span> : null}
        <Badge variant={CATEGORY_TONE[sop.category] ?? "default"}>{categoryLabel(sop.category)}</Badge>
        {sop.status !== "PUBLISHED" ? <StatusBadge value={sop.status} /> : null}
        <span className="ml-auto text-[11px] text-faint">v{sop.version}</span>
      </div>
      <h3 className="mt-2 font-display text-[15.5px] font-semibold leading-snug text-ink group-hover:text-brand">{sop.title}</h3>
      {sop.summary ? <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted">{sop.summary}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11.5px] text-muted">
        {sop.department ? (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: sop.department.color }} /> {sop.department.name}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#4F6D7A]" /> Company wide
          </span>
        )}
        {sop.stepCount ? <span>{sop.stepCount} steps</span> : null}
        {sop.hasQuiz ? <span>Quiz</span> : null}
        {sop.reviewDate ? <span className={cn(reviewDue && "text-warn")}>Review {fmtDate(sop.reviewDate)}</span> : null}
        <span className="ml-auto">
          {a === "acknowledged" ? (
            <span className="flex items-center gap-1 font-semibold text-ok">
              <CheckCircle2 className="size-3.5" /> Acknowledged
            </span>
          ) : a === "needed" ? (
            <span className="flex items-center gap-1 font-semibold text-warn">
              <ClipboardCheck className="size-3.5" /> Acknowledge
            </span>
          ) : a === "outdated" ? (
            <span className="flex items-center gap-1 font-semibold text-warn">
              <ClipboardCheck className="size-3.5" /> New version
            </span>
          ) : null}
        </span>
      </div>
    </Link>
  );
}
