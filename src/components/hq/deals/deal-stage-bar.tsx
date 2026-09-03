"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LostForm } from "@/components/hq/deals/deal-board";
import { moveDealStage, setDealNextStep } from "@/server/actions/crm";

export type StageStep = { key: string; label: string; probability: number; isWon: boolean; isLost: boolean; color: string | null };

export function DealStageBar({ dealId, current, stages }: { dealId: string; current: string; stages: StageStep[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [lostOpen, setLostOpen] = React.useState(false);
  const linear = stages.filter((s) => !s.isLost && s.key !== "nurturing");
  const currentIdx = linear.findIndex((s) => s.key === current);
  const currentStage = stages.find((s) => s.key === current);
  const move = (key: string, reason?: string) =>
    start(async () => {
      const r = await moveDealStage(dealId, key, { lostReason: reason });
      if (r.ok) {
        toast.success(`Moved to ${stages.find((s) => s.key === key)?.label}`);
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-stretch gap-1">
        {linear.map((s, i) => {
          const done = i < currentIdx || (currentStage?.isWon && s.isWon);
          const active = s.key === current;
          return (
            <button
              key={s.key}
              disabled={pending || active}
              onClick={() => move(s.key)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors",
                active ? "bg-brand text-white" : done ? "bg-brand-tint text-brand-deep hover:bg-brand-tint/70 dark:text-brand-bright" : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-ink",
                s.isWon && !active && "hover:bg-ok-soft hover:text-ok",
              )}
              title={`${s.label} · ${s.probability}%`}
            >
              {done ? <Check className="size-3" /> : null}
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
        <button disabled={pending || currentStage?.isLost} onClick={() => setLostOpen(true)} className={cn("rounded-md px-2 py-1.5 text-[12px] font-semibold", currentStage?.isLost ? "bg-bad text-white" : "bg-surface-2 text-muted hover:bg-bad-soft hover:text-bad")}>
          Lost
        </button>
        <button disabled={pending || current === "nurturing"} onClick={() => move("nurturing")} className={cn("rounded-md px-2 py-1.5 text-[12px] font-semibold", current === "nurturing" ? "bg-ink text-white" : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-ink")}>
          Nurture
        </button>
      </div>
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent size="sm">
          <LostForm
            onCancel={() => setLostOpen(false)}
            onConfirm={(reason) => {
              setLostOpen(false);
              move("lost", reason);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function NextStepEditor({ dealId, nextStep, dueAt }: { dealId: string; nextStep: string | null; dueAt: string | null }) {
  const router = useRouter();
  const [text, setText] = React.useState(nextStep ?? "");
  const [date, setDate] = React.useState(dueAt ? dueAt.slice(0, 10) : "");
  const [pending, start] = React.useTransition();
  const dirty = text !== (nextStep ?? "") || date !== (dueAt ? dueAt.slice(0, 10) : "");
  return (
    <div className="flex flex-col gap-2">
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="What happens next? For example: send site survey form" />
      <div className="flex items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Button
          size="sm"
          disabled={!dirty}
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await setDealNextStep(dealId, text, date || null);
              if (r.ok) {
                toast.success("Next step saved");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}
