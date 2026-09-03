"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/utils";

// Brand turquoise first, then a small fixed set of muted categorical colors. Assigned in order, never cycled.
export const CATEGORICAL = ["var(--brand)", "#2B5FB3", "#B4700F", "#7A3E9D", "#4F6D7A", "#1F7A4D", "#B23A48"];
const AXIS = { fontSize: 11, fill: "var(--muted)" };
const GRID = "var(--line)";

const compactMoney = (v: number) => (Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : money(v));
const shortMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + (mo === 1 ? ` ${String(y).slice(2)}` : "");
};
const shortWeek = (w: string) => {
  const d = new Date(`${w}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

type TooltipEntry = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

function ChartTooltip({ active, payload, label, formatter, labelFormatter }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number; formatter?: (v: number, key: string) => string; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label !== undefined ? <div className="mb-1 font-semibold text-ink">{labelFormatter ? labelFormatter(String(label)) : String(label)}</div> : null}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-sm" style={{ background: p.color ?? "var(--brand)" }} />
          <span>{String(p.name ?? p.dataKey ?? "")}</span>
          <span className="ml-auto pl-3 font-semibold tabular text-ink">{formatter ? formatter(Number(p.value ?? 0), String(p.dataKey ?? "")) : String(p.value ?? "")}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted">{text}</div>;
}

export function PipelineByStageChart({ data }: { data: { stage: string; count: number; value: number; color: string | null }[] }) {
  if (!data.some((d) => d.value > 0 || d.count > 0)) return <Empty text="No open deals." />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="stage" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactMoney} width={52} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip formatter={(v, k) => (k === "value" ? `${money(v)}` : String(v))} />} />
        <Bar dataKey="value" name="Open value" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? "var(--brand)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WonLostChart({ data }: { data: { month: string; won: number; lost: number; wonValue: number; lostValue: number }[] }) {
  if (!data.some((d) => d.won || d.lost)) return <Empty text="No deals closed in the last 12 months." />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={shortMonth} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip labelFormatter={shortMonth} formatter={(v) => `${v} deal${v === 1 ? "" : "s"}`} />} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
        <Bar dataKey="won" name="Won" fill="var(--ok)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="lost" name="Lost" fill="var(--bad)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PipelineByOwnerChart({ data }: { data: { owner: string; value: number; count: number }[] }) {
  if (data.length === 0) return <Empty text="No open deals." />;
  const height = Math.max(120, data.length * 36 + 24);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
        <YAxis type="category" dataKey="owner" tick={AXIS} axisLine={false} tickLine={false} width={96} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip formatter={(v) => money(v)} />} />
        <Bar dataKey="value" name="Open value" fill="var(--brand)" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 11, fill: "var(--muted)", formatter: (v: unknown) => compactMoney(Number(v)) }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadSourcesDonut({ data }: { data: { source: string; count: number }[] }) {
  const total = data.reduce((a, d) => a + d.count, 0);
  if (total === 0) return <Empty text="No contacts added in this period." />;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[180px_1fr]">
      <div className="relative h-[180px]">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="source" innerRadius={52} outerRadius={82} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
              {data.map((_, i) => (
                <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={(v) => `${v} (${Math.round((v / total) * 100)}%)`} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-xl font-bold tabular text-ink">{total}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted">contacts</span>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs">
        {data.map((d, i) => (
          <li key={d.source} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
            <span className="text-ink-2">{d.source}</span>
            <span className="ml-auto tabular text-ink">{d.count}</span>
            <span className="w-9 text-right tabular text-muted">{Math.round((d.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ServiceWeeklyChart({ data }: { data: { week: string; opened: number; resolved: number }[] }) {
  if (!data.some((d) => d.opened || d.resolved)) return <Empty text="No tickets in this period." />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={shortWeek} minTickGap={24} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip labelFormatter={(l) => `Week of ${shortWeek(l)}`} />} />
        <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
        <Bar dataKey="opened" name="Opened" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="resolved" name="Resolved" fill="#4F6D7A" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PostsPerWeekChart({ data }: { data: { week: string; posts: number }[] }) {
  if (!data.some((d) => d.posts)) return <Empty text="No posts published in this period." />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="week" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={shortWeek} minTickGap={24} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip labelFormatter={(l) => `Week of ${shortWeek(l)}`} formatter={(v) => `${v} post${v === 1 ? "" : "s"}`} />} />
        <Bar dataKey="posts" name="Posts published" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CampaignAttributionChart({ data }: { data: { campaign: string; deals: number; value: number; won: number }[] }) {
  if (data.length === 0) return <Empty text="No deals attributed to a campaign yet. Reps pick the campaign on the deal form." />;
  const height = Math.max(120, data.length * 36 + 24);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compactMoney} />
        <YAxis type="category" dataKey="campaign" tick={AXIS} axisLine={false} tickLine={false} width={120} />
        <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip formatter={(v) => money(v)} />} />
        <Bar dataKey="value" name="Attributed value" fill="var(--brand)" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 11, fill: "var(--muted)", formatter: (v: unknown) => compactMoney(Number(v)) }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
