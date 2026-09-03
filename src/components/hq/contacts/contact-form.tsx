"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormSheet, FormRow } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { CONTACT_TYPES, LEAD_SOURCES, US_STATES } from "@/lib/options";
import { saveContact, deleteContact, type ContactInput } from "@/server/actions/crm";

export type ContactFormValues = ContactInput & { id?: string; company?: PickerValue; owner?: PickerValue; tagsText?: string };

export function ContactSheet({ open, onClose, initial, defaultCompany }: { open: boolean; onClose: () => void; initial?: Partial<ContactFormValues>; defaultCompany?: PickerValue }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<ContactFormValues>({
    defaultValues: { type: "LEAD", status: "active", leadSource: "cold_outreach", company: defaultCompany ?? null, owner: null, ...initial, tagsText: initial?.tags?.join(", ") ?? "" },
  });
  React.useEffect(() => {
    if (open) form.reset({ type: "LEAD", status: "active", leadSource: "cold_outreach", company: defaultCompany ?? null, owner: null, ...initial, tagsText: initial?.tags?.join(", ") ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await saveContact({ ...v, id: initial?.id, companyId: v.company?.id ?? null, ownerId: v.owner?.id ?? null, tags: (v.tagsText ?? "").split(",").map((s) => s.trim()).filter(Boolean) });
      if (r.ok) {
        toast.success(initial?.id ? "Contact saved" : "Contact created");
        onClose();
        if (!initial?.id && r.data) router.push(`/hq/contacts/${r.data.id}`);
        else router.refresh();
      } else toast.error(r.error);
    });
  });

  const onDelete = initial?.id
    ? () => {
        if (!confirm("Delete this contact? Their timeline and tasks stay attached to the company.")) return;
        start(async () => {
          const r = await deleteContact(initial.id!);
          if (r.ok) {
            toast.success("Contact deleted");
            onClose();
            router.push("/hq/contacts");
          } else toast.error(r.error);
        });
      }
    : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit contact" : "New contact"} description="A person you sell to, support, or partner with." formId="contact-form" pending={pending} onDelete={onDelete}>
      <form id="contact-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormRow>
          <Field label="First name" required error={form.formState.errors.firstName?.message}>
            <Input {...form.register("firstName", { required: "First name is required." })} autoFocus />
          </Field>
          <Field label="Last name">
            <Input {...form.register("lastName")} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Email">
            <Input type="email" {...form.register("email")} placeholder="name@company.com" />
          </Field>
          <Field label="Job title">
            <Input {...form.register("jobTitle")} placeholder="General Manager" />
          </Field>
        </FormRow>
        <Field label="Company" hint="Pick an existing company. Leave empty to add a company later.">
          <Controller control={form.control} name="company" render={({ field }) => <EntityPicker type="company" value={field.value ?? null} onChange={field.onChange} />} />
        </Field>
        <FormRow>
          <Field label="Mobile phone">
            <Input {...form.register("phoneMobile")} />
          </Field>
          <Field label="Office phone">
            <Input {...form.register("phoneOffice")} />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Type">
            <NativeSelect {...form.register("type")}>
              {CONTACT_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Source">
            <NativeSelect {...form.register("leadSource")}>
              {LEAD_SOURCES.map((o) => (
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
        <Field label="LinkedIn">
          <Input {...form.register("linkedinUrl")} placeholder="https://linkedin.com/in/…" />
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
        <Field label="Tags" hint="Comma separated, for example: decision maker, casino, pilot">
          <Input {...form.register("tagsText")} />
        </Field>
        <Field label="Notes">
          <Textarea {...form.register("notes")} rows={3} />
        </Field>
        <Controller
          control={form.control}
          name="doNotContact"
          render={({ field }) => (
            <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm">
              <span>
                <span className="font-medium">Do not contact</span>
                <span className="block text-xs text-muted">Blocks outreach emails and sequences. Set this the moment someone opts out.</span>
              </span>
              <Switch checked={!!field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      </form>
    </FormSheet>
  );
}
