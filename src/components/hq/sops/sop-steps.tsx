"use client";

import * as React from "react";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SopStep } from "@/components/hq/sops/constants";
import { Progress } from "@/components/ui/misc";

// Interactive checklist for the reading view. Local state only: it is a reading aid, not a record.
export function SopSteps({ steps, title = "Work through the steps" }: { steps: SopStep[]; title?: string }) {
  const [done, setDone] = React.useState<boolean[]>(() => steps.map(() => false));
  const count = done.filter(Boolean).length;
  const pct = steps.length ? Math.round((count / steps.length) * 100) : 0;
  const toggle = (i: number) => setDone((d) => d.map((v, idx) => (idx === i ? !v : v)));
  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
          <p className="text-xs text-muted">
            {count} of {steps.length} done. Tick as you go; this list resets when you leave the page.
          </p>
        </div>
        <button type="button" onClick={() => setDone(steps.map(() => false))} disabled={count === 0} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40">
          <RotateCcw className="size-3.5" /> Reset
        </button>
      </header>
      <div className="px-4 pt-3">
        <Progress value={pct} tone={pct === 100 ? "ok" : "brand"} />
      </div>
      <ol className="flex flex-col p-2">
        {steps.map((s, i) => {
          const checked = done[i];
          return (
            <li key={i}>
              <button type="button" onClick={() => toggle(i)} aria-pressed={checked} className={cn("group flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2/70", checked && "opacity-70")}>
                <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors", checked ? "border-ok bg-ok text-white" : "border-line-strong bg-surface text-muted group-hover:border-brand group-hover:text-brand")}>{checked ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[14.5px] font-semibold text-ink", checked && "line-through decoration-muted")}>
                    {s.title}
                    {s.required === false ? <span className="ml-2 rounded bg-surface-2 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted no-underline">Optional</span> : null}
                  </span>
                  {s.detail ? <span className="mt-0.5 block text-[13.5px] leading-relaxed text-ink-2">{s.detail}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {pct === 100 ? <div className="border-t border-line px-4 py-2.5 text-sm font-medium text-ok">All steps done. Nice work.</div> : null}
    </section>
  );
}
