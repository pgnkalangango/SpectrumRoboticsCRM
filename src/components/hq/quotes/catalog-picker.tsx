"use client";

import * as React from "react";
import { Package, Search } from "lucide-react";
import { cn, money } from "@/lib/utils";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type CatalogProduct = { id: string; name: string; sku: string | null; oem: string | null; category: string; imageUrl: string | null; purchasePrice: number | null; monthlyPrice: number | null; description: string | null };

export function CatalogPicker({ open, onOpenChange, products, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; products: CatalogProduct[]; onPick: (p: CatalogProduct, mode: "ONE_TIME" | "MONTHLY") => void }) {
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [oem, setOem] = React.useState("");
  const categories = React.useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);
  const oems = React.useMemo(() => Array.from(new Set(products.map((p) => p.oem).filter((o): o is string => !!o))).sort(), [products]);
  const needle = q.trim().toLowerCase();
  const rows = products.filter((p) => (!category || p.category === category) && (!oem || p.oem === oem) && (!needle || [p.name, p.sku, p.oem, p.category, p.description].some((s) => s?.toLowerCase().includes(needle))));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="h-[85vh]">
        <DialogHeader>
          <DialogTitle>Add from the catalog</DialogTitle>
          <DialogDescription>Published products only. Choose purchase or monthly pricing for each item you add.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, OEM" className="pl-8" />
          </div>
          <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto min-w-40" aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={oem} onChange={(e) => setOem(e.target.value)} className="w-auto min-w-32" aria-label="OEM">
            <option value="">Any OEM</option>
            {oems.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </NativeSelect>
          <span className="ml-auto text-xs text-muted">{rows.length} of {products.length}</span>
        </div>
        <DialogBody className="flex-1 pt-0">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No products match. Try a different search or clear the filters.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {rows.map((p) => (
                <li key={p.id} className="flex gap-3 rounded-lg border border-line bg-surface p-3">
                  <Thumb src={p.imageUrl} name={p.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-ink">{p.name}</div>
                    <div className="truncate text-xs text-muted">{[p.oem, p.category, p.sku].filter(Boolean).join(" · ")}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="soft" disabled={p.purchasePrice === null} onClick={() => onPick(p, "ONE_TIME")} title={p.purchasePrice === null ? "No purchase price set" : "Add as a one time purchase"}>
                        {p.purchasePrice === null ? "No purchase price" : `Buy ${money(p.purchasePrice)}`}
                      </Button>
                      <Button size="sm" variant="secondary" disabled={p.monthlyPrice === null} onClick={() => onPick(p, "MONTHLY")} title={p.monthlyPrice === null ? "No monthly price set" : "Add as monthly Robot as a Service"}>
                        {p.monthlyPrice === null ? "No monthly price" : `${money(p.monthlyPrice)}/mo`}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function Thumb({ src, name, size = 56, className }: { src: string | null; name: string; size?: number; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2", className)} style={{ width: size, height: size }}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-contain p-1" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <Package className="size-5 text-faint" />
      )}
    </div>
  );
}
