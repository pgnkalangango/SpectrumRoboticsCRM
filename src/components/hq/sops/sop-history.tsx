"use client";

import * as React from "react";
import { Eye, History } from "lucide-react";
import { fmtDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SopMarkdown } from "@/components/hq/sops/sop-markdown";
import type { SopStep } from "@/components/hq/sops/constants";

export type SopVersionRow = { id: string; version: number; title: string; body: string; steps: SopStep[]; changeNote: string | null; changedBy: string | null; createdAt: string };

export function SopHistory({ versions, currentVersion }: { versions: SopVersionRow[]; currentVersion: number }) {
  const [open, setOpen] = React.useState<SopVersionRow | null>(null);
  if (versions.length === 0) return <p className="text-sm text-muted">No version history yet.</p>;
  return (
    <>
      <ol className="divide-y divide-line rounded-xl border border-line bg-surface">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
              <History className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-ink">Version {v.version}</span>
                {v.version === currentVersion ? <Badge variant="brand">Current</Badge> : null}
                <span className="text-muted">{v.changeNote ?? "No change note"}</span>
              </div>
              <div className="text-xs text-muted">
                {v.changedBy ?? "System"} · {fmtDateTime(v.createdAt)}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setOpen(v)}>
              <Eye /> View
            </Button>
          </li>
        ))}
      </ol>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              {open?.title} · version {open?.version}
            </DialogTitle>
            <DialogDescription>
              {open?.changeNote ?? "No change note"} · {open ? fmtDateTime(open.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="max-h-[70vh]">
            {open ? <SopMarkdown body={open.body} /> : null}
            {open && open.steps.length ? (
              <div className="mt-6">
                <h3 className="font-display text-[15px] font-semibold text-ink">Steps in this version</h3>
                <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink-2">
                  {open.steps.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium text-ink">{s.title}</span>
                      {s.detail ? <span className="text-muted"> · {s.detail}</span> : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
