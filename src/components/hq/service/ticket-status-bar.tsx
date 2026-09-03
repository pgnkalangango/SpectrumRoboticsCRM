"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { TICKET_STATUS_STEPS } from "@/components/hq/service/constants";
import { setTicketStatus } from "@/server/actions/service";
import type { TicketStatus } from "@/generated/prisma/enums";

export function TicketStatusBar({ ticketId, current, hasResolution }: { ticketId: string; current: TicketStatus; hasResolution: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [resolveOpen, setResolveOpen] = React.useState(false);
  const [resolution, setResolution] = React.useState("");
  const currentIdx = TICKET_STATUS_STEPS.findIndex((s) => s.value === current);

  const move = (status: TicketStatus, text?: string) =>
    start(async () => {
      const r = await setTicketStatus(ticketId, status, text);
      if (r.ok) {
        toast.success(`Ticket ${TICKET_STATUS_STEPS.find((s) => s.value === status)?.label.toLowerCase()}`);
        setResolveOpen(false);
        setResolution("");
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="mb-5 rounded-xl border border-line bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-stretch gap-1">
        {TICKET_STATUS_STEPS.map((s, i) => {
          const active = s.value === current;
          const done = i < currentIdx;
          return (
            <button
              key={s.value}
              type="button"
              disabled={pending || active}
              title={s.hint}
              onClick={() => (s.value === "RESOLVED" && !hasResolution ? setResolveOpen(true) : move(s.value))}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors",
                active ? (s.value === "RESOLVED" || s.value === "CLOSED" ? "bg-ok text-white" : "bg-brand text-white") : done ? "bg-brand-tint text-brand-deep hover:bg-brand-tint/70 dark:text-brand-bright" : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-ink",
                s.value === "RESOLVED" && !active && "hover:bg-ok-soft hover:text-ok",
              )}
            >
              {done ? <Check className="size-3" /> : null}
              <span className="truncate">{s.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted">{TICKET_STATUS_STEPS[currentIdx]?.hint} Moving past New records the first response time.</p>
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Mark as resolved</DialogTitle>
            <DialogDescription>Write what fixed it. The customer sees this in their portal, and it becomes the record for next time.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Resolution" required>
              <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} autoFocus placeholder="Re-mapped the bar entrance and moved the charging dock 2 feet left. Tested three full laps." />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button loading={pending} disabled={!resolution.trim()} onClick={() => move("RESOLVED", resolution)}>
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
