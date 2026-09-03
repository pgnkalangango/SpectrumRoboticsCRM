"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormRow, FormSheet, useUrlSheet } from "@/components/hq/form-sheet";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Thumb } from "@/components/hq/quotes/catalog-picker";
import { deleteProduct, saveProduct } from "@/server/actions/catalog";

export type ProductFormValues = {
  id?: string;
  name: string;
  sku: string;
  oem: string;
  category: string;
  description: string;
  imageUrl: string;
  purchasePrice: string;
  monthlyPrice: string;
  internalCost: string;
  priceDisplayPrefix: string;
  warrantyMonths: string;
  leadTimeDays: string;
  published: boolean;
  sortOrder: string;
  specsText: string;
};

export const EMPTY_PRODUCT: ProductFormValues = { name: "", sku: "", oem: "", category: "Service Robot", description: "", imageUrl: "", purchasePrice: "", monthlyPrice: "", internalCost: "", priceDisplayPrefix: "from", warrantyMonths: "12", leadTimeDays: "", published: false, sortOrder: "100", specsText: "" };

export function ProductSheet({ open, onClose, initial, categories, oems, canSeeCost, isOwner }: { open: boolean; onClose: () => void; initial?: ProductFormValues; categories: string[]; oems: string[]; canSeeCost: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<ProductFormValues>({ defaultValues: initial ?? EMPTY_PRODUCT });
  React.useEffect(() => {
    if (open) form.reset(initial ?? EMPTY_PRODUCT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const imageUrl = form.watch("imageUrl");
  const published = form.watch("published");
  const purchase = Number(form.watch("purchasePrice"));
  const cost = Number(form.watch("internalCost"));
  const margin = canSeeCost && purchase > 0 && cost > 0 ? Math.round(((purchase - cost) / purchase) * 100) : null;

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await saveProduct({ ...v, id: initial?.id, purchasePrice: v.purchasePrice === "" ? null : Number(v.purchasePrice), monthlyPrice: v.monthlyPrice === "" ? null : Number(v.monthlyPrice), internalCost: v.internalCost === "" ? null : Number(v.internalCost), warrantyMonths: v.warrantyMonths === "" ? null : Number(v.warrantyMonths), leadTimeDays: v.leadTimeDays === "" ? null : Number(v.leadTimeDays), sortOrder: Number(v.sortOrder) || 100 });
      if (r.ok) {
        toast.success(initial?.id ? "Product saved" : "Product added");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  });
  const onDelete =
    initial?.id && isOwner
      ? () => {
          if (!confirm(`Delete ${initial.name}? Products used on quotes cannot be deleted.`)) return;
          start(async () => {
            const r = await deleteProduct(initial.id!);
            if (r.ok) {
              toast.success("Product deleted");
              onClose();
              router.refresh();
            } else toast.error(r.error);
          });
        }
      : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit product" : "New product"} description="What appears in the quote builder and, when published, on the website." formId="product-form" pending={pending} onDelete={onDelete} width="max-w-2xl">
      <form id="product-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <Thumb src={imageUrl || null} name={form.watch("name") || "Product"} size={72} />
          <div className="flex-1">
            <Field label="Name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name", { required: "Give the product a name." })} placeholder="BellaBot Pro" autoFocus />
            </Field>
          </div>
        </div>
        <FormRow cols={3}>
          <Field label="SKU">
            <Input {...form.register("sku")} placeholder="21510-000202" />
          </Field>
          <Field label="OEM">
            <Input {...form.register("oem")} list="oem-list" placeholder="Pudu" />
            <datalist id="oem-list">
              {oems.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </Field>
          <Field label="Category">
            <Input {...form.register("category", { required: true })} list="category-list" />
            <datalist id="category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Purchase price ($)">
            <Input type="number" min={0} step="0.01" {...form.register("purchasePrice")} className="tabular" />
          </Field>
          <Field label="Monthly price ($)" hint="Robot as a Service">
            <Input type="number" min={0} step="0.01" {...form.register("monthlyPrice")} className="tabular" />
          </Field>
          {canSeeCost ? (
            <Field label="Internal cost ($)" hint={margin !== null ? `${margin}% margin on purchase` : "Owners only. Never shown to clients."}>
              <Input type="number" min={0} step="0.01" {...form.register("internalCost")} className="tabular bg-warn-soft/30" />
            </Field>
          ) : (
            <Field label="Price prefix" hint="Public pricing language">
              <NativeSelect {...form.register("priceDisplayPrefix")}>
                <option value="from">from</option>
                <option value="">exact</option>
              </NativeSelect>
            </Field>
          )}
        </FormRow>
        <FormRow cols={3}>
          <Field label="Warranty (months)">
            <Input type="number" min={0} {...form.register("warrantyMonths")} />
          </Field>
          <Field label="Lead time (days)">
            <Input type="number" min={0} {...form.register("leadTimeDays")} />
          </Field>
          <Field label="Sort order" hint="Lower shows first">
            <Input type="number" {...form.register("sortOrder")} />
          </Field>
        </FormRow>
        <Field label="Image URL">
          <Input {...form.register("imageUrl")} placeholder="https://spectrumrobotics.ai/robots/bellabot-pro.png" />
        </Field>
        <Field label="Description">
          <Textarea rows={3} {...form.register("description")} />
        </Field>
        <Field label="Specs" hint="Free text, one spec per line.">
          <Textarea rows={4} {...form.register("specsText")} placeholder={"Payload: 40 kg\nRuntime: 12 to 24 hours\nTrays: 4"} />
        </Field>
        <label className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-ink">Published</span>
            <span className="block text-xs text-muted">Published products can be added to quotes and appear on the website.</span>
          </span>
          <Switch checked={published} onCheckedChange={(v) => form.setValue("published", v)} />
        </label>
      </form>
    </FormSheet>
  );
}

export function ProductSheetFromUrl({ initial, categories, oems, canSeeCost, isOwner }: { initial?: ProductFormValues; categories: string[]; oems: string[]; canSeeCost: boolean; isOwner: boolean }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  if (edit.open && initial && initial.id === edit.value) return <ProductSheet open onClose={edit.close} initial={initial} categories={categories} oems={oems} canSeeCost={canSeeCost} isOwner={isOwner} />;
  return <ProductSheet open={create.open} onClose={create.close} categories={categories} oems={oems} canSeeCost={canSeeCost} isOwner={isOwner} />;
}
