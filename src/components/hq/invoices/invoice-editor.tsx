"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/utils";
import { computeInvoiceTotals, num } from "@/lib/quotes/math";
import { FormRow, FormSheet, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveInvoice } from "@/server/actions/invoices";

export type EditorLine = { key: string; description: string; quantity: string; unitPrice: string; pricingMode: "ONE_TIME" | "MONTHLY" };
export type EditorInvoice = { id: string; title: string; issueDate: string; dueDate: string; paymentTerms: string; taxRate: string; notes: string; company: PickerValue; contact: PickerValue; lines: EditorLine[] };

let seq = 0;
const key = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;

export function InvoiceEditorFromUrl({ initial }: { initial: EditorInvoice }) {
  const sheet = useUrlSheet("edit");
  // Remount on each open so the form starts from the latest saved invoice.
  return <InvoiceEditor key={sheet.open ? "open" : "closed"} open={sheet.open} onClose={sheet.close} initial={initial} />;
}

export function InvoiceEditor({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: EditorInvoice }) {
  const router = useRouter();
  const [inv, setInv] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const set = <K extends keyof EditorInvoice>(k: K, v: EditorInvoice[K]) => setInv((s) => ({ ...s, [k]: v }));
  const setLine = (k: string, patch: Partial<EditorLine>) => setInv((s) => ({ ...s, lines: s.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) }));
  const totals = computeInvoiceTotals(inv.lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), pricingMode: l.pricingMode })), num(inv.taxRate));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveInvoice({
        id: inv.id,
        title: inv.title || null,
        issueDate: inv.issueDate || null,
        dueDate: inv.dueDate || null,
        paymentTerms: inv.paymentTerms || null,
        taxRate: num(inv.taxRate),
        notes: inv.notes || null,
        companyId: inv.company?.id ?? null,
        contactId: inv.contact?.id ?? null,
        lines: inv.lines.map((l) => ({ description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice), pricingMode: l.pricingMode })),
      });
      if (r.ok) {
        toast.success("Invoice saved");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title="Edit draft invoice" description="Change what is billed before you send it. Totals are recalculated on save." formId="invoice-editor" pending={pending} width="max-w-2xl">
      <form id="invoice-editor" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Title">
          <Input value={inv.title} onChange={(e) => set("title", e.target.value)} placeholder="What this invoice covers" />
        </Field>
        <FormRow>
          <Field label="Company">
            <EntityPicker type="company" value={inv.company} onChange={(v) => set("company", v)} />
          </Field>
          <Field label="Contact">
            <EntityPicker type="contact" value={inv.contact} onChange={(v) => set("contact", v)} companyId={inv.company?.id} />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Issue date">
            <Input type="date" value={inv.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={inv.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </Field>
          <Field label="Terms">
            <Input value={inv.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="Net 30" />
          </Field>
        </FormRow>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink-2">Lines</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => setInv((s) => ({ ...s, lines: [...s.lines, { key: key(), description: "", quantity: "1", unitPrice: "0", pricingMode: "ONE_TIME" }] }))}>
              <Plus /> Add line
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {inv.lines.map((l) => (
              <div key={l.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_110px_64px_110px_auto]">
                <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Description" className="sm:col-span-1 col-span-2" />
                <NativeSelect value={l.pricingMode} onChange={(e) => setLine(l.key, { pricingMode: e.target.value as "ONE_TIME" | "MONTHLY" })}>
                  <option value="ONE_TIME">One time</option>
                  <option value="MONTHLY">Monthly</option>
                </NativeSelect>
                <Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className="text-right tabular" />
                <Input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} className="text-right tabular" />
                <Button type="button" size="icon-sm" variant="ghost" className="text-muted hover:text-bad" onClick={() => setInv((s) => ({ ...s, lines: s.lines.filter((x) => x.key !== l.key) }))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <FormRow>
          <Field label="Tax rate (%)" hint="One time lines only.">
            <Input type="number" min={0} max={100} step="0.001" value={inv.taxRate} onChange={(e) => set("taxRate", e.target.value)} />
          </Field>
          <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="tabular">{money(totals.subtotal, { cents: true })}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Tax</span>
              <span className="tabular">{money(totals.taxAmount, { cents: true })}</span>
            </div>
            <div className="mt-1 flex justify-between font-semibold text-ink">
              <span>Total</span>
              <span className="tabular">{money(totals.total, { cents: true })}</span>
            </div>
          </div>
        </FormRow>
        <Field label="Notes to the client">
          <Textarea rows={3} value={inv.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </form>
    </FormSheet>
  );
}
