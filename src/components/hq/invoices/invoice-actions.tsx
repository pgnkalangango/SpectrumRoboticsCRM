"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Copy, Download, Ban, DollarSign, Pencil, RefreshCw, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { money, todayISO } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormRow } from "@/components/hq/form-sheet";
import { deleteDraftInvoice, recordPayment, sendInvoice, syncInvoiceToQuickBooks, voidInvoice } from "@/server/actions/invoices";

export type InvoiceActionState = {
  id: string;
  number: string;
  status: string;
  balanceDue: number;
  publicToken: string | null;
  contactEmail: string | null;
  contactName: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksConnected: boolean;
};

const METHODS = [
  { value: "CHECK", label: "Check" },
  { value: "WIRE", label: "Wire or bank transfer" },
  { value: "ACH", label: "ACH" },
  { value: "CARD", label: "Card" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER", label: "Other" },
];

export function InvoiceActions({ invoice, isOwner, isLeadership }: { invoice: InvoiceActionState; isOwner: boolean; isLeadership: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [dialog, setDialog] = React.useState<null | "send" | "payment" | "void">(null);
  const [text, setText] = React.useState("");
  const [pay, setPay] = React.useState({ amount: String(invoice.balanceDue), method: "CHECK", reference: "", paidAt: todayISO() });
  const openPayment = () => {
    setPay({ amount: String(invoice.balanceDue), method: "CHECK", reference: "", paidAt: todayISO() });
    setDialog("payment");
  };
  const s = invoice.status;
  const openStatus = s === "SENT" || s === "VIEWED" || s === "PARTIALLY_PAID" || s === "OVERDUE";

  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, success: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(success);
        setDialog(null);
        setText("");
        after?.();
        router.refresh();
      } else toast.error(r.error ?? "Something went wrong.");
    });

  const copyLink = async () => {
    if (!invoice.publicToken) return;
    const url = `${window.location.origin}/i/${invoice.publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Public link copied");
    } catch {
      toast.error(url);
    }
  };

  return (
    <>
      <Button asChild variant="secondary" size="sm">
        <a href={`/hq/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
          <Download /> PDF
        </a>
      </Button>
      {invoice.publicToken && s !== "DRAFT" ? (
        <Button variant="secondary" size="sm" onClick={copyLink}>
          <Copy /> Copy link
        </Button>
      ) : null}
      {s === "DRAFT" ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/hq/invoices/${invoice.id}?edit=1`}>
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
            if (!confirm(`Delete draft ${invoice.number}?`)) return;
            run(() => deleteDraftInvoice(invoice.id), "Draft deleted", () => router.push("/hq/invoices"));
          }}
        >
          <Trash2 /> Delete
        </Button>
      ) : null}
      {isOwner && s !== "DRAFT" && s !== "VOID" ? (
        <Button variant="secondary" size="sm" disabled={pending || !invoice.quickbooksConnected} title={invoice.quickbooksConnected ? undefined : "Connect QuickBooks from Integrations first"} onClick={() => run(() => syncInvoiceToQuickBooks(invoice.id), invoice.quickbooksInvoiceId ? "QuickBooks invoice updated" : "Synced to QuickBooks")}>
          <BookOpen /> {invoice.quickbooksInvoiceId ? "Resync QuickBooks" : "Sync to QuickBooks"}
        </Button>
      ) : null}
      {openStatus && isLeadership ? (
        <Button variant="ghost" size="sm" className="text-bad hover:bg-bad-soft" onClick={() => setDialog("void")}>
          <Ban /> Void
        </Button>
      ) : null}
      {openStatus && invoice.balanceDue > 0 ? (
        <Button variant="secondary" size="sm" onClick={openPayment}>
          <DollarSign /> Record payment
        </Button>
      ) : null}
      {s === "DRAFT" ? (
        <Button size="sm" onClick={() => setDialog("send")}>
          <Send /> Send to client
        </Button>
      ) : openStatus ? (
        <Button size="sm" variant="secondary" onClick={() => setDialog("send")}>
          <RefreshCw /> Send reminder
        </Button>
      ) : null}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent size="md">
          {dialog === "send" ? (
            <>
              <DialogHeader>
                <DialogTitle>{s === "DRAFT" ? "Send the invoice" : "Send a reminder"}</DialogTitle>
                <DialogDescription>
                  {invoice.contactEmail ? (
                    <>
                      Emails {invoice.contactName ?? "the contact"} at <span className="font-medium text-ink">{invoice.contactEmail}</span> with a link to view and pay online.
                    </>
                  ) : (
                    "This invoice has no contact email. Edit it and pick a contact first."
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field label="Personal note (optional)">
                  <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Thanks again for choosing Spectrum Robotics. Let me know if you need a W-9." />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button loading={pending} disabled={!invoice.contactEmail} onClick={() => run(() => sendInvoice(invoice.id, { message: text }), s === "DRAFT" ? "Invoice sent" : "Reminder sent")}>
                  <Send /> Send
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {dialog === "payment" ? (
            <>
              <DialogHeader>
                <DialogTitle>Record a payment</DialogTitle>
                <DialogDescription>{money(invoice.balanceDue, { cents: true })} is still due on {invoice.number}. Card and bank payments made online are recorded automatically.</DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col gap-3">
                <FormRow>
                  <Field label="Amount ($)" required>
                    <Input type="number" min={0.01} step="0.01" max={invoice.balanceDue} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="tabular" autoFocus />
                  </Field>
                  <Field label="Method">
                    <NativeSelect value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                      {METHODS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                </FormRow>
                <FormRow>
                  <Field label="Reference" hint="Check number, wire ID, confirmation.">
                    <Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                  </Field>
                  <Field label="Date received">
                    <Input type="date" value={pay.paidAt} onChange={(e) => setPay({ ...pay, paidAt: e.target.value })} />
                  </Field>
                </FormRow>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button loading={pending} onClick={() => run(() => recordPayment(invoice.id, { amount: Number(pay.amount), method: pay.method as "CHECK", reference: pay.reference || null, paidAt: pay.paidAt || null }), "Payment recorded")}>
                  <DollarSign /> Record {money(Number(pay.amount) || 0, { cents: true })}
                </Button>
              </DialogFooter>
            </>
          ) : null}
          {dialog === "void" ? (
            <>
              <DialogHeader>
                <DialogTitle>Void invoice {invoice.number}</DialogTitle>
                <DialogDescription>The invoice stays on record with a zero balance and can no longer be paid. Create a new invoice if the amounts were wrong.</DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field label="Reason">
                  <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Reissued with the corrected tax rate." />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" loading={pending} onClick={() => run(() => voidInvoice(invoice.id, text), "Invoice voided")}>
                  <Ban /> Void invoice
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
