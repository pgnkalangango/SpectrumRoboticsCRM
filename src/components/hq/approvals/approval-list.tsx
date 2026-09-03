"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, ShieldCheck, Undo2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime, label, money, relTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { decideApproval, withdrawApproval } from "@/server/actions/approvals";

export type ApprovalRow = {
  id: string;
  type: string;
  subject: string;
  reason: string | null;
  status: string;
  entityType: string | null;
  entityId: string | null;
  requiredTier: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  details: Record<string, unknown> | null;
  requestedBy: { id: string; name: string; image: string | null; avatarColor: string | null } | null;
  decidedBy: { name: string } | null;
};

const TYPE_LABEL: Record<string, string> = { QUOTE_DISCOUNT: "Quote discount", QUOTE_SEND: "Quote send", CATALOG_PUBLISH: "Catalog publish", REFUND: "Refund", EXPENSE: "Expense", DEMO_REQUEST: "Demo request", SOCIAL_POST: "Social post", ACCESS_REQUEST: "Access request", OTHER: "Other" };
const OWNER_ONLY = ["QUOTE_DISCOUNT", "REFUND", "EXPENSE"];

export function ApprovalList({ rows, canDecide, isOwner, currentUserId, history }: { rows: ApprovalRow[]; canDecide: boolean; isOwner: boolean; currentUserId: string; history?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [dialog, setDialog] = React.useState<{ row: ApprovalRow; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = React.useState("");

  const decide = () => {
    if (!dialog) return;
    const { row, decision } = dialog;
    start(async () => {
      const r = await decideApproval(row.id, decision, note);
      if (r.ok) {
        toast.success(decision === "APPROVED" ? "Approved" : "Not approved");
        setDialog(null);
        setNote("");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  if (rows.length === 0) return <EmptyState icon={ShieldCheck} title={history ? "No decisions yet" : "Nothing waiting on you"} body={history ? "Decided requests will show up here." : "Discount requests, access requests and posts that need a decision will land here."} />;

  return (
    <>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const ownerGate = OWNER_ONLY.includes(r.type) || r.requiredTier === "OWNER";
          const mayDecide = canDecide && (!ownerGate || isOwner);
          return (
            <li key={r.id} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={ownerGate ? "brand" : "info"}>{TYPE_LABEL[r.type] ?? label(r.type)}</Badge>
                    {history ? <StatusBadge value={r.status} /> : ownerGate ? <span className="text-[11px] text-muted">Owner decision</span> : null}
                    <span className="ml-auto text-[11px] text-faint md:hidden">{relTime(r.createdAt)}</span>
                  </div>
                  <h3 className="mt-1.5 text-[15px] font-semibold text-ink">{r.subject}</h3>
                  {r.reason ? <p className="mt-1 text-sm text-ink-2">{r.reason}</p> : null}
                  <Details row={r} />
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                    {r.requestedBy ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar name={r.requestedBy.name} src={r.requestedBy.image} color={r.requestedBy.avatarColor} size={16} /> {r.requestedBy.name}
                      </span>
                    ) : (
                      <span>System</span>
                    )}
                    <span title={fmtDateTime(r.createdAt)}>Requested {relTime(r.createdAt)}</span>
                    {r.decidedAt ? (
                      <span>
                        {r.status === "WITHDRAWN" ? "Withdrawn" : "Decided"} {relTime(r.decidedAt)}
                        {r.decidedBy ? ` by ${r.decidedBy.name}` : ""}
                      </span>
                    ) : null}
                    {r.decisionNote ? <span className="text-ink-2">Note: {r.decisionNote}</span> : null}
                  </div>
                </div>
                {!history ? (
                  <div className="flex shrink-0 items-center gap-2">
                    {mayDecide ? (
                      <>
                        <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialog({ row: r, decision: "REJECTED" })}>
                          <X /> Reject
                        </Button>
                        <Button size="sm" disabled={pending} onClick={() => setDialog({ row: r, decision: "APPROVED" })}>
                          <Check /> Approve
                        </Button>
                      </>
                    ) : r.requestedBy?.id === currentUserId ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await withdrawApproval(r.id);
                            if (res.ok) {
                              toast.success("Request withdrawn");
                              router.refresh();
                            } else toast.error(res.error);
                          })
                        }
                      >
                        <Undo2 /> Withdraw
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">{ownerGate ? "Waiting for an owner" : "Waiting for a decision"}</span>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{dialog?.decision === "APPROVED" ? "Approve this request?" : "Reject this request?"}</DialogTitle>
            <DialogDescription>{dialog?.row.subject}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label={dialog?.decision === "APPROVED" ? "Note (optional)" : "Tell them why"} hint="The requester sees this note.">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant={dialog?.decision === "APPROVED" ? "default" : "destructive"} loading={pending} onClick={decide}>
              {dialog?.decision === "APPROVED" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Details({ row }: { row: ApprovalRow }) {
  const d = row.details ?? {};
  const items: { k: string; v: React.ReactNode }[] = [];
  if (row.type === "QUOTE_DISCOUNT") {
    if (typeof d.company === "string") items.push({ k: "Company", v: d.company });
    if (typeof d.maxDiscountPct === "number") items.push({ k: "Discount", v: `up to ${d.maxDiscountPct}% (${money(Number(d.discountTotal ?? 0), { cents: true })} off)` });
    if (typeof d.total === "number") items.push({ k: "One time total", v: money(d.total, { cents: true }) });
    if (typeof d.monthlyTotal === "number" && d.monthlyTotal) items.push({ k: "Monthly", v: `${money(d.monthlyTotal, { cents: true })}/mo` });
  } else if (row.type === "ACCESS_REQUEST") {
    if (typeof d.email === "string") items.push({ k: "Email", v: d.email });
    if (typeof d.company === "string" && d.company) items.push({ k: "Company", v: d.company });
    if (typeof d.kind === "string") items.push({ k: "Wants", v: d.kind === "CLIENT" ? "Client portal access" : "Staff access to HQ" });
  } else {
    for (const [k, v] of Object.entries(d).slice(0, 6)) if (typeof v === "string" || typeof v === "number") items.push({ k: label(k), v: String(v) });
  }
  const link = row.entityType === "Quote" && row.entityId ? `/hq/quotes/${row.entityId}` : row.entityType === "SocialPost" ? "/hq/marketing" : null;
  if (items.length === 0 && !link) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
      {items.map((it) => (
        <span key={it.k}>
          <span className="text-muted">{it.k}: </span>
          <span className="font-medium text-ink">{it.v}</span>
        </span>
      ))}
      {link ? (
        <Link href={link} className="flex items-center gap-1 font-medium text-brand hover:underline">
          Open {row.entityType === "Quote" ? "quote" : "post"} <ExternalLink className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
