"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Send, ShieldCheck, Copy, Download, GitBranch, Receipt, Trash2, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { approveQuote, deleteQuote, rejectQuote, reviseQuote, sendQuote, submitForApproval } from "@/server/actions/quotes";
import { createInvoiceFromQuote } from "@/server/actions/invoices";

export type QuoteActionState = {
  id: string;
  number: string;
  status: string;
  hasDiscount: boolean;
  publicToken: string | null;
  contactEmail: string | null;
  contactName: string | null;
  invoice: { id: string; number: string } | null;
  supersededBy: { id: string; number: string } | null;
};

export function QuoteActions({ quote, canDiscount, isLeadership }: { quote: QuoteActionState; canDiscount: boolean; isLeadership: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [dialog, setDialog] = React.useState<null | "send" | "resend" | "request" | "approve" | "reject">(null);
  const [text, setText] = React.useState("");
  const s = quote.status;
  const run = (fn: () => Promise<{ ok: boolean; error?: string } & { data?: unknown }>, success: string, after?: (data: unknown) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(success);
        setDialog(null);
        setText("");
        after?.(r.data);
        router.refresh();
      } else toast.error(r.error ?? "Something went wrong.");
    });

  const copyLink = async () => {
    if (!quote.publicToken) return;
    const url = `${window.location.origin}/q/${quote.publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Public link copied");
    } catch {
      toast.error(url);
    }
  };

  const needsApproval = quote.hasDiscount && s === "DRAFT" && !canDiscount;
  const canSend = (s === "DRAFT" && !needsApproval) || s === "APPROVED";
  const canEdit = s === "DRAFT" || s === "APPROVED";
  const open = s === "SENT" || s === "VIEWED";

  return (
    <>
      <Button asChild variant="secondary" size="sm">
        <a href={`/hq/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">
          <Download /> PDF
        </a>
      </Button>
      {quote.publicToken && s !== "DRAFT" && s !== "SUPERSEDED" ? (
        <Button variant="secondary" size="sm" onClick={copyLink}>
          <Copy /> Copy link
        </Button>
      ) : null}
      {canEdit ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/hq/quotes/${quote.id}/edit`}>
            <Pencil /> Edit
          </Link>
        </Button>
      ) : null}
      {s === "DRAFT" && isLeadership ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-bad hover:bg-bad-soft"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete draft ${quote.number}? This cannot be undone.`)) return;
            run(() => deleteQuote(quote.id), "Draft deleted", () => router.push("/hq/quotes"));
          }}
        >
          <Trash2 /> Delete
        </Button>
      ) : null}
      {needsApproval ? (
        <Button size="sm" onClick={() => setDialog("request")}>
          <ShieldCheck /> Request approval
        </Button>
      ) : null}
      {s === "PENDING_APPROVAL" && canDiscount ? (
        <>
          <Button variant="secondary" size="sm" onClick={() => setDialog("reject")}>
            <X /> Send back
          </Button>
          <Button size="sm" onClick={() => setDialog("approve")}>
            <Check /> Approve discount
          </Button>
        </>
      ) : null}
      {s === "PENDING_APPROVAL" && !canDiscount ? <span className="text-xs text-muted">Waiting for an owner to approve the discount</span> : null}
      {canSend ? (
        <Button size="sm" onClick={() => setDialog("send")}>
          <Send /> Send to client
        </Button>
      ) : null}
      {open ? (
        <Button variant="secondary" size="sm" onClick={() => setDialog("resend")}>
          <RefreshCw /> Resend
        </Button>
      ) : null}
      {(open || s === "DECLINED" || s === "EXPIRED" || s === "ACCEPTED") && !quote.supersededBy ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => reviseQuote(quote.id), "New version started", (d) => router.push(`/hq/quotes/${(d as { id: string }).id}/edit`))}>
          <GitBranch /> Revise
        </Button>
      ) : null}
      {s === "ACCEPTED" ? (
        quote.invoice ? (
          <Button asChild size="sm">
            <Link href={`/hq/invoices/${quote.invoice.id}`}>
              <Receipt /> Invoice {quote.invoice.number}
            </Link>
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => run(() => createInvoiceFromQuote(quote.id), "Invoice created", (d) => router.push(`/hq/invoices/${(d as { id: string }).id}`))}>
            <Receipt /> Create invoice
          </Button>
        )
      ) : null}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="md">
          {dialog === "send" || dialog === "resend" ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialog === "resend" ? "Resend the quote" : "Send the quote"}</DialogTitle>
                <DialogDescription>
                  {quote.contactEmail ? (
                    <>
                      Emails {quote.contactName ?? "the contact"} at <span className="font-medium text-ink">{quote.contactEmail}</span> with a link to view, accept or decline online.
                    </>
                  ) : (
                    "This quote has no contact email. Edit the quote and pick a contact first."
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field label="Personal note (optional)" hint="Goes above the quote summary in the email.">
                  <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Great speaking with you today. Here is the pricing we discussed." />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button loading={pending} disabled={!quote.contactEmail} onClick={() => run(() => sendQuote(quote.id, { message: text }), dialog === "resend" ? "Quote resent" : "Quote sent")}>
                  <Send /> {dialog === "resend" ? "Resend" : "Send now"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {dialog === "request" ? (
            <>
              <DialogHeader>
                <DialogTitle>Ask an owner to approve the discount</DialogTitle>
                <DialogDescription>Owners get a notification and decide from the Approvals page. You will hear back on your notifications.</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field label="Why this discount?" hint="One or two sentences help the decision go faster.">
                  <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Multi unit order, matching a competitor quote at the same site." />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button loading={pending} onClick={() => run(() => submitForApproval(quote.id, text), "Approval requested")}>
                  <ShieldCheck /> Request approval
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {dialog === "approve" || dialog === "reject" ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialog === "approve" ? "Approve this discount" : "Send the quote back"}</DialogTitle>
                <DialogDescription>{dialog === "approve" ? "The quote becomes approved and the rep can send it." : "The quote goes back to draft so the rep can change the pricing."}</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field label={dialog === "approve" ? "Note (optional)" : "What should change?"}>
                  <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                {dialog === "approve" ? (
                  <Button loading={pending} onClick={() => run(() => approveQuote(quote.id, text), "Discount approved")}>
                    <Check /> Approve
                  </Button>
                ) : (
                  <Button variant="destructive" loading={pending} onClick={() => run(() => rejectQuote(quote.id, text), "Sent back to draft")}>
                    <X /> Send back
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
