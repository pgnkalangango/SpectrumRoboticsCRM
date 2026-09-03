"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { COMPANY_STATUSES, INDUSTRIES, US_STATES } from "@/lib/options";
import { saveCompany, deleteCompany, type CompanyInput } from "@/server/actions/crm";

export type CompanyFormValues = CompanyInput & { id?: string; owner?: PickerValue; tagsText?: string };

export function CompanySheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<CompanyFormValues> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<CompanyFormValues>({ defaultValues: { status: "PROSPECT", industry: "hospitality", owner: null, ...initial, tagsText: initial?.tags?.join(", ") ?? "" } });
  React.useEffect(() => {
    if (open) form.reset({ status: "PROSPECT", industry: "hospitality", owner: null, ...initial, tagsText: initial?.tags?.join(", ") ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await saveCompany({ ...v, id: initial?.id, ownerId: v.owner?.id ?? null, tags: (v.tagsText ?? "").split(",").map((s) => s.trim()).filter(Boolean) });
      if (r.ok) {
        toast.success(initial?.id ? "Company saved" : "Company created");
        onClose();
        if (!initial?.id && r.data) router.push(`/hq/companies/${r.data.id}`);
        else router.refresh();
      } else toast.error(r.error);
    });
  });
  const onDelete = initial?.id
    ? () => {
        if (!confirm("Delete this company?")) return;
        start(async () => {
          const r = await deleteCompany(initial.id!);
          if (r.ok) {
            toast.success("Company deleted");
            onClose();
            router.push("/hq/companies");
          } else toast.error(r.error);
        });
      }
    : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit company" : "New company"} description="A customer, prospect, partner or vendor organization." formId="company-form" pending={pending} onDelete={onDelete}>
      <form id="company-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Company name" required error={form.formState.errors.name?.message}>
          <Input {...form.register("name", { required: "Company name is required." })} autoFocus />
        </Field>
        <FormRow>
          <Field label="Website">
            <Input {...form.register("website")} placeholder="https://" />
          </Field>
          <Field label="Email domain" hint="Used to match client sign ups and inbound mail.">
            <Input {...form.register("domain")} placeholder="company.com" />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Industry">
            <NativeSelect {...form.register("industry")}>
              {INDUSTRIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect {...form.register("status")}>
              {COMPANY_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Owner">
            <Controller control={form.control} name="owner" render={({ field }) => <EntityPicker type="user" value={field.value ?? null} onChange={field.onChange} placeholder="Me" />} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Phone">
            <Input {...form.register("phone")} />
          </Field>
          <Field label="Employees">
            <Input type="number" min={0} {...form.register("employeeCount")} />
          </Field>
        </FormRow>
        <Field label="Street address">
          <Input {...form.register("addressStreet")} />
        </Field>
        <FormRow cols={3}>
          <Field label="City">
            <Input {...form.register("addressCity")} />
          </Field>
          <Field label="State">
            <NativeSelect {...form.register("addressState")}>
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="ZIP">
            <Input {...form.register("addressZip")} />
          </Field>
        </FormRow>
        <Field label="Tags" hint="Comma separated">
          <Input {...form.register("tagsText")} />
        </Field>
        <Field label="Notes">
          <Textarea {...form.register("notes")} rows={3} />
        </Field>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Client portal</div>
          <Controller
            control={form.control}
            name="portalEnabled"
            render={({ field }) => (
              <label className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">Portal enabled</span>
                  <span className="block text-xs text-muted">People who sign up with this company's email domain get access automatically.</span>
                </span>
                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          <Field label="Client code" hint="Optional short code a rep can give a client to sign up, for example HCA-2026." className="mt-3">
            <Input {...form.register("clientCode")} className="uppercase" />
          </Field>
        </div>
      </form>
    </FormSheet>
  );
}

export function CompanySheetFromUrl({ initial }: { initial?: Partial<CompanyFormValues> }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  if (edit.open && initial) return <CompanySheet open onClose={edit.close} initial={initial} />;
  return <CompanySheet open={create.open} onClose={create.close} />;
}
