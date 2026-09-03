"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { SITE_TYPES, US_STATES } from "@/lib/options";
import { SITE_STATUSES } from "@/components/hq/service/constants";
import { saveSite, deleteSite, type SiteInput } from "@/server/actions/service";

export type SiteFormValues = Omit<SiteInput, "companyId" | "primaryContactId" | "accountManagerId" | "technicianId"> & { id?: string; company?: PickerValue; primaryContact?: PickerValue; accountManager?: PickerValue; technician?: PickerValue };

export function SiteSheet({ open, onClose, initial, defaults }: { open: boolean; onClose: () => void; initial?: Partial<SiteFormValues>; defaults?: Partial<SiteFormValues> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const base: Partial<SiteFormValues> = { siteType: "other", status: "PROSPECT", company: null, primaryContact: null, accountManager: null, technician: null, ...defaults };
  const form = useForm<SiteFormValues>({ defaultValues: { ...base, ...initial } });
  React.useEffect(() => {
    if (open) form.reset({ ...base, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const company = form.watch("company");

  const onSubmit = form.handleSubmit((v) => {
    if (!v.company?.id) {
      form.setError("company", { message: "Pick the company this site belongs to." });
      return;
    }
    start(async () => {
      const r = await saveSite({ ...v, id: initial?.id, companyId: v.company!.id, primaryContactId: v.primaryContact?.id ?? null, accountManagerId: v.accountManager?.id ?? null, technicianId: v.technician?.id ?? null });
      if (r.ok) {
        toast.success(initial?.id ? "Site saved" : "Site added");
        onClose();
        if (!initial?.id && r.data) router.push(`/hq/service/sites/${r.data.id}`);
        else router.refresh();
      } else toast.error(r.error);
    });
  });
  const onDelete = initial?.id
    ? () => {
        if (!confirm("Delete this site? Only possible when it has no robots, tickets or certificates.")) return;
        start(async () => {
          const r = await deleteSite(initial.id!);
          if (r.ok) {
            toast.success("Site deleted");
            onClose();
            router.push("/hq/service/sites");
          } else toast.error(r.error);
        });
      }
    : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit site" : "New site"} description="A physical location where robots run: a casino floor, a hotel, a hospital wing." formId="site-form" pending={pending} onDelete={onDelete} submitLabel={initial?.id ? "Save site" : "Add site"}>
      <form id="site-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Site name" required error={form.formState.errors.name?.message}>
          <Input {...form.register("name", { required: "Give the site a name." })} placeholder="Hollywood Casino Aurora, main floor" autoFocus />
        </Field>
        <Field label="Company" required error={form.formState.errors.company?.message as string | undefined}>
          <Controller
            control={form.control}
            name="company"
            render={({ field }) => (
              <EntityPicker
                type="company"
                value={field.value ?? null}
                onChange={(v) => {
                  field.onChange(v);
                  form.clearErrors("company");
                  form.setValue("primaryContact", null);
                }}
              />
            )}
          />
        </Field>
        <Field label="Street address">
          <Input {...form.register("addressStreet")} placeholder="49 W Galena Blvd" />
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
        <FormRow cols={3}>
          <Field label="Site type">
            <NativeSelect {...form.register("siteType")}>
              {SITE_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Square footage">
            <Input type="number" min={0} step="1" {...form.register("sqFootage")} placeholder="45000" />
          </Field>
          <Field label="Floors">
            <Input type="number" min={0} step="1" {...form.register("floors")} placeholder="1" />
          </Field>
        </FormRow>
        <Field label="Wi-Fi notes" hint="Network name, who owns it, coverage gaps. Robots need solid Wi-Fi on every route.">
          <Textarea {...form.register("wifiNotes")} rows={2} />
        </Field>
        <Field label="Primary contact" hint={company ? "People at this company." : "Pick the company first."}>
          <Controller control={form.control} name="primaryContact" render={({ field }) => <EntityPicker type="contact" value={field.value ?? null} onChange={field.onChange} companyId={company?.id} disabled={!company} />} />
        </Field>
        <FormRow>
          <Field label="Account manager">
            <Controller control={form.control} name="accountManager" render={({ field }) => <EntityPicker type="user" value={field.value ?? null} onChange={field.onChange} placeholder="Me" />} />
          </Field>
          <Field label="Technician">
            <Controller control={form.control} name="technician" render={({ field }) => <EntityPicker type="user" value={field.value ?? null} onChange={field.onChange} placeholder="Not assigned yet" />} />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Status">
            <NativeSelect {...form.register("status")}>
              {SITE_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Survey date">
            <Input type="date" {...form.register("surveyDate")} />
          </Field>
          <Field label="Go live date">
            <Input type="date" {...form.register("goLiveDate")} />
          </Field>
        </FormRow>
        <Field label="Notes">
          <Textarea {...form.register("notes")} rows={3} placeholder="Access hours, parking, who to call on site, anything a technician should know before arriving." />
        </Field>
      </form>
    </FormSheet>
  );
}

// ?new=1 opens a blank site (companyId and companyName prefill from the query); ?edit=1 edits the given record.
export function SiteSheetFromUrl({ initial, defaultCompany }: { initial?: Partial<SiteFormValues>; defaultCompany?: PickerValue }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  const sp = useSearchParams();
  const companyId = sp.get("companyId");
  const company = defaultCompany ?? (companyId ? { id: companyId, label: sp.get("companyName") ?? "Selected company" } : null);
  if (edit.open && initial) return <SiteSheet open onClose={edit.close} initial={initial} />;
  return <SiteSheet open={create.open} onClose={create.close} defaults={company ? { company } : undefined} />;
}
