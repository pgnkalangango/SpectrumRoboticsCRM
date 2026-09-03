"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { savePipelineStages } from "@/server/actions/settings";

export type StageRow = { key: string; label: string; probability: number; color: string; sortOrder: number; isWon: boolean; isLost: boolean };

export function PipelineStagesForm({ stages: initial }: { stages: StageRow[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [rows, setRows] = React.useState(initial);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const update = (i: number, patch: Partial<StageRow>) => setRows((r) => r.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next.map((s, idx) => ({ ...s, sortOrder: idx * 10 })));
  };
  const save = () =>
    start(async () => {
      const r = await savePipelineStages(rows.map((s) => ({ key: s.key, label: s.label, probability: s.probability, color: s.color, sortOrder: s.sortOrder })));
      if (r.ok) {
        toast.success("Pipeline stages saved");
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-display text-[17px] font-bold text-ink">Pipeline stages</h2>
        <p className="mt-0.5 text-sm text-muted">Stage keys are fixed because automations and SOPs point at them. Rename, recolor, reorder, and set the win probability used for weighted pipeline.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="pb-2 pr-2">Order</th>
              <th className="pb-2 pr-2">Key</th>
              <th className="pb-2 pr-2">Label</th>
              <th className="pb-2 pr-2">Probability %</th>
              <th className="pb-2 pr-2">Color</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.key} className="border-t border-line">
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-0.5">
                    <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                </td>
                <td className="py-2 pr-2">
                  <span className="font-mono text-xs text-muted">{s.key}</span>
                  {s.isWon ? <Badge variant="ok" className="ml-1">Won</Badge> : s.isLost ? <Badge variant="bad" className="ml-1">Lost</Badge> : null}
                </td>
                <td className="py-2 pr-2">
                  <Input value={s.label} onChange={(e) => update(i, { label: e.target.value })} className="h-8" />
                </td>
                <td className="py-2 pr-2">
                  <Input type="number" min={0} max={100} value={s.probability} onChange={(e) => update(i, { probability: Number(e.target.value) })} className="h-8 w-24 tabular" />
                </td>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <input type="color" value={s.color || "#9AA4AB"} onChange={(e) => update(i, { color: e.target.value })} className="size-8 cursor-pointer rounded border border-line bg-surface p-0.5" aria-label="Stage color" />
                    <Input value={s.color} onChange={(e) => update(i, { color: e.target.value })} className="h-8 w-28 font-mono text-xs" placeholder="#149CA0" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3 border-t border-line pt-4">
        {dirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
        <Button onClick={save} loading={pending} disabled={!dirty}>
          Save stages
        </Button>
      </div>
    </div>
  );
}
