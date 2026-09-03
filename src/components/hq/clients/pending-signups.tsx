"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { approveSignup, denySignup } from "@/server/actions/clients";

export type PendingRow = { id: string; name: string; email: string; phone: string | null; createdAt: string; emailVerified: boolean; company: { id: string; name: string; autoCreated: boolean; portalEnabled: boolean } | null };

export function PendingSignups({ rows }: { rows: PendingRow[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [companies, setCompanies] = React.useState<Record<string, PickerValue>>(() => Object.fromEntries(rows.map((r) => [r.id, r.company ? { id: r.company.id, label: r.company.name } : null])));
  const [deny, setDeny] = React.useState<PendingRow | null>(null);
  const [note, setNote] = React.useState("");

  const approve = (r: PendingRow) => {
    const c = companies[r.id];
    if (!c) {
      toast.error("Pick the company first.");
      return;
    }
    start(async () => {
      const res = await approveSignup(r.id, c.id);
      if (res.ok) {
        toast.success(`${r.name} can sign in now`);
        router.refresh();
      } else toast.error(res.error);
    });
  };
  const confirmDeny = () => {
    if (!deny) return;
    const target = deny;
    start(async () => {
      const res = await denySignup(target.id, note || null);
      if (res.ok) {
        toast.success("Request denied and the person was told");
        setDeny(null);
        setNote("");
        router.refresh();
      } else toast.error(res.error);
    });
  };

  if (rows.length === 0) return <EmptyState icon={Inbox} title="No sign ups waiting" body="When a customer signs up on the portal and we cannot match them automatically, they show up here for a quick yes or no." />;

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={r.name} size={36} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{r.name}</span>
                    {r.emailVerified ? <Badge variant="ok">Email confirmed</Badge> : <Badge variant="warn">Email not confirmed</Badge>}
                    {r.company?.autoCreated ? <Badge variant="info">New company from sign up</Badge> : null}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {r.email}
                    {r.phone ? ` · ${r.phone}` : ""} · signed up {relTime(r.createdAt)}
                  </div>
                </div>
              </div>
              <div className="w-full md:w-72">
                <EntityPicker type="company" value={companies[r.id] ?? null} onChange={(v) => setCompanies((c) => ({ ...c, [r.id]: v }))} placeholder="Link to a company" allowClear={false} />
                {r.company?.autoCreated ? <p className="mt-1 text-[11px] text-muted">Created from the sign up form. Pick the real customer record if one exists.</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" onClick={() => approve(r)} disabled={pending}>
                  <Check /> Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setDeny(r)} disabled={pending}>
                  <X /> Deny
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!deny} onOpenChange={(o) => !o && setDeny(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Deny {deny?.name}?</DialogTitle>
            <DialogDescription>They get a polite email saying we could not match their request to a customer account.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional line to include in the email" />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeny(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeny} loading={pending}>
              Deny and email them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
