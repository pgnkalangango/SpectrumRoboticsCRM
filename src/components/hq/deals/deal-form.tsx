"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CHANNELS, DEAL_TYPES } from "@/lib/options";
import { saveDeal, deleteDeal, type DealInput } from "@/server/actions/crm";

export type StageOption = { key: string; label: string; probability: number };
export type DealFormValues = DealInput & { id?: string; company?: PickerValue; contact?: PickerValue; owner?: PickerValue; tagsText?: string };

export function DealSheet({ open, onClose, initial, stages, defaults }: { open: boolean; onClose: () => void; initial?: Partial<DealFormValues>; stages: StageOption[]; defaults?: Partial<DealFormValues> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const base: Partial<DealFormValues> = { stageKey: stages[0]?.key ?? "new", dealType: "NEW_BUSINESS", channel: "email", value: 0, monthlyValue: 0, company: null, contact: null, owner: null, ...defaults };
  const form = useForm<DealFormValues>({ defaultValues: { ...base, ...initial, tagsText: initial?.tags?.join(", ") ?? "" } });
  React.useEffect(() => {
    if (open) form.reset({ ...base, ...initial, tagsText: initial?.tags?.join(", ") ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const company = form.watch("company");

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await saveDeal({ ...v, id: initial?.id, companyId: v.company?.id ?? null, primaryContactId: v.contact?.id ?? null, ownerId: v.owner?.id ?? null, tags: (v.tagsText ?? "").split(",").map((s) => s.trim()).filter(Boolean) });
      if (r.ok) {
        toast.success(initial?.id ? "Deal saved" : "Deal created");
        onClose();
        if (!initial?.id && r.data) router.push(`/hq/deals/${r.data.id}`);
        else router.refresh();
      } else toast.error(r.error);
    });
  });
  const onDelete = initial?.id
    ? () => {
        if (!confirm("Delete this deal? Quotes and activity stay attached to the company.")) return;
        start(async () => {
          const r = await deleteDeal(initial.id!);
          if (r.ok) {
            toast.success("Deal deleted");
            onClose();
            router.push("/hq/deals");
          } else toast.error(r.error);
        });
      }
    : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit deal" : "New deal"} description="An opportunity you are working toward a signed agreement." formId="deal-form" pending={pending} onDelete={onDelete}>
      <form id="deal-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Deal name" required error={form.formState.errors.name?.message}>
          <Input {...form.register("name", { required: "Give the deal a name." })} placeholder="Hollywood Casino Aurora, 4 BellaBot Pro" autoFocus />
        </Field>
        <FormRow>
          <Field label="Company">
            <Controller control={form.control} name="company" render={({ field }) => <EntityPicker type="company" value={field.value ?? null} onChange={(v) => { field.onChange(v); form.setValue("contact", null); }} />} />
          </Field>
          <Field label="Main contact">
            <Controller control={form.control} name="contact" render={({ field }) => <EntityPicker type="contact" value={field.value ?? null} onChange={field.onChange} companyId={company?.id} />} />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="One time value ($)" hint="Purchase, delivery, install">
            <Input type="number" min={0} step="1" {...form.register("value")} />
          </Field>
          <Field label="Monthly value ($)" hint="Robot as a Service">
            <Input type="number" min={0} step="1" {...form.register("monthlyValue")} />
          </Field>
          <Field label="Expected close">
            <Input type="date" {...form.register("expectedCloseDate")} />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Stage">
            <NativeSelect {...form.register("stageKey")}>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({s.probability}%)
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Type">
            <NativeSelect {...form.register("dealType")}>
              {DEAL_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Channel">
            <NativeSelect {...form.register("channel")}>
              {CHANNELS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Next step" hint="Every open deal needs one.">
            <Input {...form.register("nextStep")} placeholder="Book the assessment visit" />
          </Field>
          <Field label="Next step due">
            <Input type="date" {...form.register("nextStepDueAt")} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Owner">
            <Controller control={form.control} name="owner" render={({ field }) => <EntityPicker type="user" value={field.value ?? null} onChange={field.onChange} placeholder="Me" />} />
          </Field>
          <Field label="Tags" hint="Comma separated">
            <Input {...form.register("tagsText")} />
          </Field>
        </FormRow>
        <Field label="Notes">
          <Textarea {...form.register("notes")} rows={3} />
        </Field>
      </form>
    </FormSheet>
  );
}

export function DealSheetFromUrl({ initial, stages }: { initial?: Partial<DealFormValues>; stages: StageOption[] }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  const sp = useSearchParams();
  const companyId = sp.get("companyId");
  const companyName = sp.get("companyName");
  const defaults = companyId ? { company: { id: companyId, label: companyName ?? "Selected company" } } : undefined;
  if (edit.open && initial) return <DealSheet open onClose={edit.close} initial={initial} stages={stages} />;
  return <DealSheet open={create.open} onClose={create.close} stages={stages} defaults={defaults} />;
}
