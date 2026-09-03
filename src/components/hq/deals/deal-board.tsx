"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useDroppable, useDraggable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn, money, relTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { LOST_REASONS } from "@/lib/options";
import { moveDealStage } from "@/server/actions/crm";

export type BoardStage = { key: string; label: string; probability: number; isWon: boolean; isLost: boolean; color: string | null };
export type BoardDeal = { id: string; name: string; companyName: string | null; value: number; monthlyValue: number; stageKey: string; owner: { name: string; image: string | null; avatarColor: string | null } | null; nextStep: string | null; nextStepDueAt: string | null; lastActivityAt: string | null; stale: boolean; expectedCloseDate: string | null };

export function DealBoard({ stages, deals: initialDeals, staleDays }: { stages: BoardStage[]; deals: BoardDeal[]; staleDays: number }) {
  const router = useRouter();
  const [deals, setDeals] = React.useState(initialDeals);
  React.useEffect(() => setDeals(initialDeals), [initialDeals]);
  const [active, setActive] = React.useState<BoardDeal | null>(null);
  const [lostPrompt, setLostPrompt] = React.useState<{ deal: BoardDeal; stageKey: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setActive(deals.find((d) => d.id === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    setActive(null);
    const dealId = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || !target || target === deal.stageKey) return;
    const stage = stages.find((s) => s.key === target);
    if (!stage) return;
    if (stage.isLost) {
      setLostPrompt({ deal, stageKey: target });
      return;
    }
    await commitMove(deal, target);
  };
  const commitMove = async (deal: BoardDeal, stageKey: string, lostReason?: string) => {
    const prev = deals;
    setDeals((ds) => ds.map((d) => (d.id === deal.id ? { ...d, stageKey } : d)));
    const r = await moveDealStage(deal.id, stageKey, { lostReason });
    if (!r.ok) {
      setDeals(prev);
      toast.error(r.error);
    } else {
      const s = stages.find((x) => x.key === stageKey);
      toast.success(`${deal.name} → ${s?.label ?? stageKey}`);
      router.refresh();
    }
  };
  const visibleStages = stages;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="kanban-scroll flex gap-3 overflow-x-auto pb-3">
          {visibleStages.map((s) => {
            const items = deals.filter((d) => d.stageKey === s.key);
            const sum = items.reduce((a, d) => a + d.value, 0);
            const monthly = items.reduce((a, d) => a + d.monthlyValue, 0);
            return <Column key={s.key} stage={s} items={items} sum={sum} monthly={monthly} staleDays={staleDays} />;
          })}
        </div>
        <DragOverlay>{active ? <DealCard deal={active} dragging /> : null}</DragOverlay>
      </DndContext>
      <Dialog open={!!lostPrompt} onOpenChange={(o) => !o && setLostPrompt(null)}>
        <DialogContent size="sm">
          <LostForm
            onCancel={() => setLostPrompt(null)}
            onConfirm={async (reason) => {
              if (!lostPrompt) return;
              const p = lostPrompt;
              setLostPrompt(null);
              await commitMove(p.deal, p.stageKey, reason);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Column({ stage, items, sum, monthly, staleDays }: { stage: BoardStage; items: BoardDeal[]; sum: number; monthly: number; staleDays: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <div ref={setNodeRef} className={cn("flex w-[272px] shrink-0 flex-col rounded-xl border border-line bg-surface-2/60 transition-colors", isOver && "border-brand bg-brand-tint/40")}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: stage.color ?? "#9AA4AB" }} />
          <span className="text-[13px] font-semibold">{stage.label}</span>
          <span className="rounded bg-surface px-1.5 text-[11px] text-muted">{items.length}</span>
        </div>
        <span className="text-[11px] text-muted">{stage.probability}%</span>
      </div>
      <div className="px-3 pb-2 text-[11px] text-muted tabular">
        {money(sum)}
        {monthly ? ` + ${money(monthly)}/mo` : ""}
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-2 pb-2">
        {items.map((d) => (
          <Draggable key={d.id} deal={d} staleDays={staleDays} />
        ))}
        {items.length === 0 ? <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line text-xs text-faint">Drop here</div> : null}
      </div>
    </div>
  );
}

function Draggable({ deal, staleDays }: { deal: BoardDeal; staleDays: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.4 : 1 }}>
      <DealCard deal={deal} staleDays={staleDays} />
    </div>
  );
}

function DealCard({ deal, dragging, staleDays = 14 }: { deal: BoardDeal; dragging?: boolean; staleDays?: number }) {
  const overdueNext = deal.nextStepDueAt && new Date(deal.nextStepDueAt).getTime() < Date.now();
  const warn = !deal.nextStep || overdueNext || deal.stale;
  return (
    <div className={cn("cursor-grab rounded-lg border border-line bg-surface p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing", dragging && "rotate-1 shadow-lg")}>
      <Link href={`/hq/deals/${deal.id}`} className="block text-[13.5px] font-semibold leading-snug text-ink hover:text-brand" onPointerDown={(e) => e.stopPropagation()}>
        {deal.name}
      </Link>
      {deal.companyName ? <div className="mt-0.5 truncate text-xs text-muted">{deal.companyName}</div> : null}
      <div className="mt-2 flex items-center justify-between">
        <span className="font-display text-sm font-bold tabular">
          {money(deal.value)}
          {deal.monthlyValue ? <span className="text-xs font-medium text-muted"> + {money(deal.monthlyValue)}/mo</span> : null}
        </span>
        {deal.owner ? <Avatar name={deal.owner.name} src={deal.owner.image} color={deal.owner.avatarColor} size={22} /> : null}
      </div>
      <div className={cn("mt-2 flex items-center gap-1 text-[11px]", warn ? "text-warn" : "text-muted")}>
        {warn ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
        <span className="truncate">{!deal.nextStep ? "No next step" : overdueNext ? `Next step overdue: ${deal.nextStep}` : deal.stale ? `Quiet ${staleDays}+ days` : deal.nextStep}</span>
      </div>
      {deal.lastActivityAt ? <div className="mt-1 text-[10px] text-faint">Last activity {relTime(deal.lastActivityAt)}</div> : null}
    </div>
  );
}

export function LostForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = React.useState(LOST_REASONS[0]);
  const [detail, setDetail] = React.useState("");
  return (
    <>
      <DialogHeader>
        <DialogTitle>Why was it lost?</DialogTitle>
        <DialogDescription>Lost reasons feed the reports so we learn what to fix.</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)}>
          {LOST_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </NativeSelect>
        <Textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Anything else worth remembering (optional)" />
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={() => onConfirm(detail ? `${reason}: ${detail}` : reason)}>
          Mark lost
        </Button>
      </DialogFooter>
    </>
  );
}
