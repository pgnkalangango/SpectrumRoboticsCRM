"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { deleteCampaign, saveCampaign, type CampaignInput } from "@/server/actions/marketing";

export type CampaignFormValues = CampaignInput & { id?: string; owner?: PickerValue };

export const CAMPAIGN_TYPES = [
  { value: "social", label: "Social" },
  { value: "email", label: "Email" },
  { value: "event", label: "Event" },
  { value: "ads", label: "Ads" },
  { value: "outreach", label: "Outreach" },
  { value: "content", label: "Content" },
];
export const CAMPAIGN_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

export function CampaignSheet({ open, onClose, initial, canDelete }: { open: boolean; onClose: () => void; initial?: Partial<CampaignFormValues>; canDelete?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const base: CampaignFormValues = { name: "", type: "social", status: "planned", channel: "", description: "", startDate: "", endDate: "", budget: undefined, utmCampaign: "", owner: null };
  const form = useForm<CampaignFormValues>({ defaultValues: { ...base, ...initial } });
  React.useEffect(() => {
    if (open) form.reset({ ...base, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      const r = await saveCampaign({ ...v, id: initial?.id, ownerId: v.owner?.id ?? null, budget: v.budget === undefined || v.budget === null || (v.budget as unknown) === "" ? null : Number(v.budget) });
      if (r.ok) {
        toast.success(initial?.id ? "Campaign saved" : "Campaign created");
        onClose();
        if (!initial?.id && r.data) router.push(`/hq/marketing/campaigns/${r.data.id}`);
        else router.refresh();
      } else toast.error(r.error);
    }),
  );
  const onDelete = initial?.id && canDelete
    ? () => {
        if (!confirm("Delete this campaign?")) return;
        start(async () => {
          const r = await deleteCampaign(initial.id!);
          if (r.ok) {
            toast.success("Campaign deleted");
            onClose();
            router.push("/hq/marketing/campaigns");
          } else toast.error(r.error);
        });
      }
    : undefined;
  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit campaign" : "New campaign"} description="A campaign groups posts and the deals they influence so you can see what worked." formId="campaign-form" pending={pending} onDelete={onDelete}>
      <form id="campaign-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Name" required error={form.formState.errors.name?.message}>
          <Input {...form.register("name", { required: "Give the campaign a name." })} placeholder="Fall casino push" autoFocus />
        </Field>
        <FormRow cols={3}>
          <Field label="Type">
            <NativeSelect {...form.register("type")}>
              {CAMPAIGN_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect {...form.register("status")}>
              {CAMPAIGN_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Channel" hint="linkedin, instagram, event">
            <Input {...form.register("channel")} />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Starts">
            <Input type="date" {...form.register("startDate")} />
          </Field>
          <Field label="Ends">
            <Input type="date" {...form.register("endDate")} />
          </Field>
          <Field label="Budget ($)">
            <Input type="number" min={0} step="1" {...form.register("budget")} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Owner">
            <Controller control={form.control} name="owner" render={({ field }) => <EntityPicker type="user" value={field.value ?? null} onChange={field.onChange} placeholder="Me" />} />
          </Field>
          <Field label="UTM campaign" hint="Used in links so web leads attribute back here.">
            <Input {...form.register("utmCampaign")} placeholder="fall-casino-push" />
          </Field>
        </FormRow>
        <Field label="Description" hint="Reps attach a campaign to a deal from the deal form. That is how deals show up here.">
          <Textarea {...form.register("description")} rows={3} />
        </Field>
      </form>
    </FormSheet>
  );
}

export function CampaignSheetFromUrl({ initial, canDelete }: { initial?: Partial<CampaignFormValues>; canDelete?: boolean }) {
  const create = useUrlSheet("new");
  const edit = useUrlSheet("edit");
  if (edit.open && initial) return <CampaignSheet open onClose={edit.close} initial={initial} canDelete={canDelete} />;
  return <CampaignSheet open={create.open} onClose={create.close} />;
}
