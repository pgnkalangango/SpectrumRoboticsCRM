"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Package, Info } from "lucide-react";
import { toast } from "sonner";
import { cn, money } from "@/lib/utils";
import { computeQuoteTotals, num } from "@/lib/quotes/math";
import { Panel } from "@/components/hq/record";
import { FormRow } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CatalogPicker, type CatalogProduct } from "@/components/hq/quotes/catalog-picker";
import { saveQuote } from "@/server/actions/quotes";

export type BuilderLine = { key: string; productId: string | null; productName: string | null; description: string; quantity: string; unitPrice: string; pricingMode: "ONE_TIME" | "MONTHLY"; discountPct: string };

export type BuilderQuote = {
  id?: string;
  number?: string;
  status?: string;
  title: string;
  company: PickerValue;
  contact: PickerValue;
  deal: PickerValue;
  owner: PickerValue;
  validUntil: string;
  taxRate: string;
  deliveryFee: string;
  installFee: string;
  notes: string;
  terms: string;
  internalNotes: string;
  lines: BuilderLine[];
};

let keySeq = 0;
const newKey = () => `l${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export function emptyLine(partial: Partial<BuilderLine> = {}): BuilderLine {
  return { key: newKey(), productId: null, productName: null, description: "", quantity: "1", unitPrice: "0", pricingMode: "ONE_TIME", discountPct: "0", ...partial };
}

export function QuoteBuilder({ initial, products, canDiscount }: { initial: BuilderQuote; products: CatalogProduct[]; canDiscount: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState<BuilderQuote>(initial);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const set = <K extends keyof BuilderQuote>(k: K, v: BuilderQuote[K]) => setQ((s) => ({ ...s, [k]: v }));
  const setLine = (key: string, patch: Partial<BuilderLine>) => setQ((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const removeLine = (key: string) => setQ((s) => ({ ...s, lines: s.lines.filter((l) => l.key !== key) }));
  const addCustom = () => setQ((s) => ({ ...s, lines: [...s.lines, emptyLine()] }));
  const addProduct = (p: CatalogProduct, mode: "ONE_TIME" | "MONTHLY") => {
    const price = mode === "MONTHLY" ? p.monthlyPrice : p.purchasePrice;
    setQ((s) => ({ ...s, lines: [...s.lines, emptyLine({ productId: p.id, productName: p.name, description: p.name, unitPrice: String(price ?? 0), pricingMode: mode })] }));
    toast.success(`${p.name} added${mode === "MONTHLY" ? " as monthly" : ""}`);
  };

  const totals = React.useMemo(
    () => computeQuoteTotals({ lines: q.lines.map((l) => ({ quantity: num(l.quantity), unitPrice: num(l.unitPrice), pricingMode: l.pricingMode, discountPct: num(l.discountPct) })), deliveryFee: num(q.deliveryFee), installFee: num(q.installFee), taxRate: num(q.taxRate) }),
    [q.lines, q.deliveryFee, q.installFee, q.taxRate],
  );
  const discounted = q.lines.some((l) => num(l.discountPct) > 0);
  const hasMonthly = q.lines.some((l) => l.pricingMode === "MONTHLY");

  const save = () => {
    if (!q.title.trim()) return toast.error("Give the quote a title.");
    if (q.lines.length === 0) return toast.error("Add at least one line.");
    start(async () => {
      const r = await saveQuote({
        id: q.id,
        title: q.title,
        companyId: q.company?.id ?? null,
        contactId: q.contact?.id ?? null,
        dealId: q.deal?.id ?? null,
        ownerId: q.owner?.id ?? null,
        validUntil: q.validUntil || null,
        taxRate: num(q.taxRate),
        deliveryFee: num(q.deliveryFee),
        installFee: num(q.installFee),
        notes: q.notes || null,
        terms: q.terms || null,
        internalNotes: q.internalNotes || null,
        lines: q.lines.map((l) => ({ productId: l.productId, description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice), pricingMode: l.pricingMode, discountPct: num(l.discountPct) })),
      });
      if (r.ok && r.data) {
        toast.success(q.id ? "Quote saved" : `Quote ${r.data.number} created`);
        router.push(`/hq/quotes/${r.data.id}`);
        router.refresh();
      } else if (!r.ok) toast.error(r.error);
    });
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Quote details">
          <div className="flex flex-col gap-4">
            <Field label="Title" required hint="What the client is buying, in their words.">
              <Input value={q.title} onChange={(e) => set("title", e.target.value)} placeholder="Two BellaBot Pro for the main dining room" autoFocus={!q.id} />
            </Field>
            <FormRow cols={3}>
              <Field label="Company">
                <EntityPicker
                  type="company"
                  value={q.company}
                  onChange={(v) => {
                    set("company", v);
                    if (v?.id !== q.company?.id) set("contact", null);
                  }}
                />
              </Field>
              <Field label="Contact" hint="Who receives the email and can accept.">
                <EntityPicker type="contact" value={q.contact} onChange={(v) => set("contact", v)} companyId={q.company?.id} />
              </Field>
              <Field label="Deal">
                <EntityPicker type="deal" value={q.deal} onChange={(v) => set("deal", v)} companyId={q.company?.id} />
              </Field>
            </FormRow>
            <FormRow cols={3}>
              <Field label="Valid until">
                <Input type="date" value={q.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
              </Field>
              <Field label="Tax rate (%)" hint="Applied to one time items, delivery and install.">
                <Input type="number" min={0} max={100} step="0.001" value={q.taxRate} onChange={(e) => set("taxRate", e.target.value)} />
              </Field>
              <Field label="Owner">
                <EntityPicker type="user" value={q.owner} onChange={(v) => set("owner", v)} placeholder="Me" />
              </Field>
            </FormRow>
          </div>
        </Panel>

        <Panel
          title={`Line items${q.lines.length ? ` (${q.lines.length})` : ""}`}
          padded={false}
          action={
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="secondary" onClick={addCustom}>
                <Plus /> Custom line
              </Button>
              <Button size="sm" onClick={() => setPickerOpen(true)}>
                <Package /> Add from catalog
              </Button>
            </div>
          }
        >
          {q.lines.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <Package className="size-6 text-faint" />
              <p className="text-sm font-medium text-ink">No lines yet</p>
              <p className="max-w-sm text-sm text-muted">Add robots, accessories and services from the catalog, or write a custom line for anything else.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={addCustom}>
                  Custom line
                </Button>
                <Button size="sm" onClick={() => setPickerOpen(true)}>
                  Add from catalog
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2/70 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-left">Billing</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Unit price</th>
                    <th className="px-2 py-2 text-right">Disc. %</th>
                    <th className="px-2 py-2 text-right">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.lines.map((l, i) => {
                    const lt = totals.lineTotals[i];
                    return (
                      <tr key={l.key} className="align-top">
                        <td className="min-w-[260px] px-4 py-2.5">
                          <Input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Describe the item or service" />
                          {l.productName ? (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                              <Badge variant="brand">Catalog</Badge> {l.productName}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2.5">
                          <NativeSelect value={l.pricingMode} onChange={(e) => setLine(l.key, { pricingMode: e.target.value as "ONE_TIME" | "MONTHLY" })} className="w-32">
                            <option value="ONE_TIME">One time</option>
                            <option value="MONTHLY">Monthly</option>
                          </NativeSelect>
                        </td>
                        <td className="px-2 py-2.5">
                          <Input type="number" min={1} step="1" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className="w-16 text-right tabular" />
                        </td>
                        <td className="px-2 py-2.5">
                          <Input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => setLine(l.key, { unitPrice: e.target.value })} className="w-28 text-right tabular" />
                        </td>
                        <td className="px-2 py-2.5">
                          <Input type="number" min={0} max={100} step="0.5" value={l.discountPct} onChange={(e) => setLine(l.key, { discountPct: e.target.value })} className={cn("w-20 text-right tabular", num(l.discountPct) > 0 && "border-warn text-warn")} />
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <div className="pt-2 font-semibold tabular">{money(lt?.total ?? 0, { cents: true })}</div>
                          {l.pricingMode === "MONTHLY" ? <div className="text-[11px] text-muted">per month</div> : null}
                        </td>
                        <td className="px-2 py-2.5">
                          <Button size="icon-sm" variant="ghost" onClick={() => removeLine(l.key)} title="Remove line" className="mt-0.5 text-muted hover:text-bad">
                            <Trash2 />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Fees, notes and terms">
          <div className="flex flex-col gap-4">
            <FormRow>
              <Field label="Delivery fee ($)">
                <Input type="number" min={0} step="0.01" value={q.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} />
              </Field>
              <Field label="Installation and training fee ($)">
                <Input type="number" min={0} step="0.01" value={q.installFee} onChange={(e) => set("installFee", e.target.value)} />
              </Field>
            </FormRow>
            <Field label="Notes to the client" hint="Shown on the quote under the totals.">
              <Textarea rows={3} value={q.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Includes on site mapping, staff training and 30 days of check ins." />
            </Field>
            <Field label="Terms">
              <Textarea rows={4} value={q.terms} onChange={(e) => set("terms", e.target.value)} />
            </Field>
            <Field label="Internal notes" hint="Staff only. Never shown to the client or on the PDF.">
              <Textarea rows={3} value={q.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} placeholder="Margin notes, competitor pricing, anything the team should know." className="bg-warn-soft/30" />
            </Field>
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-4">
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <div className="eyebrow">Totals</div>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <Row label="Subtotal" value={money(totals.subtotal, { cents: true })} />
            {totals.discountTotal ? <Row label="Discounts" value={`-${money(totals.discountTotal, { cents: true })}`} tone="warn" /> : null}
            {totals.deliveryFee ? <Row label="Delivery" value={money(totals.deliveryFee, { cents: true })} /> : null}
            {totals.installFee ? <Row label="Install and training" value={money(totals.installFee, { cents: true })} /> : null}
            <Row label={`Tax (${totals.taxRate}%)`} value={money(totals.taxAmount, { cents: true })} />
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">One time total</div>
            <div className="mt-1 font-display text-[28px] font-bold leading-none tabular text-ink">{money(totals.total, { cents: true })}</div>
            {hasMonthly ? (
              <div className="mt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Monthly service</div>
                <div className="mt-1 font-display text-xl font-bold leading-none tabular text-brand">
                  {money(totals.monthlyTotal, { cents: true })}
                  <span className="text-sm font-medium text-muted"> / mo</span>
                </div>
              </div>
            ) : null}
          </div>
          {discounted ? (
            <div className={cn("mt-4 flex gap-2 rounded-lg px-3 py-2 text-xs", canDiscount ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "bg-warn-soft text-warn")}>
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>{canDiscount ? "This quote includes a discount. As an owner you can send it directly." : "This quote includes a discount. Save it, then request an owner's approval before sending."}</span>
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-2">
            <Button size="lg" onClick={save} loading={pending} className="w-full">
              {q.id ? "Save changes" : "Save draft"}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={q.id ? `/hq/quotes/${q.id}` : "/hq/quotes"}>Cancel</Link>
            </Button>
          </div>
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-faint">Totals are recalculated on the server when you save. Send the quote from its page once it looks right.</p>
      </aside>

      <CatalogPicker open={pickerOpen} onOpenChange={setPickerOpen} products={products} onPick={addProduct} />
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-medium tabular", tone === "warn" ? "text-warn" : "text-ink")}>{value}</dd>
    </div>
  );
}
