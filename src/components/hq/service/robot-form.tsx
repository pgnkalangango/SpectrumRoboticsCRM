"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { FormSheet, FormRow, useUrlSheet } from "@/components/hq/form-sheet";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { OWNERSHIPS, ROBOT_STATUSES } from "@/components/hq/service/constants";
import { saveRobot, deleteRobot, type RobotInput } from "@/server/actions/service";

export type RobotFormValues = Omit<RobotInput, "productId" | "siteId" | "companyId"> & { id?: string; product?: PickerValue; site?: PickerValue; company?: PickerValue };

export function RobotSheet({ open, onClose, initial, defaults, defaultInterval = 90 }: { open: boolean; onClose: () => void; initial?: Partial<RobotFormValues>; defaults?: Partial<RobotFormValues>; defaultInterval?: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const base: Partial<RobotFormValues> = { status: "IN_STOCK", ownership: "RAAS", maintenanceIntervalDays: defaultInterval, product: null, site: null, company: null, ...defaults };
  const form = useForm<RobotFormValues>({ defaultValues: { ...base, ...initial } });
  React.useEffect(() => {
    if (open) form.reset({ ...base, ...initial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const company = form.watch("company");

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await saveRobot({ ...v, id: initial?.id, productId: v.product?.id ?? null, siteId: v.site?.id ?? null, companyId: v.company?.id ?? null });
      if (r.ok) {
        toast.success(initial?.id ? "Robot saved" : "Robot added");
        onClose();
        if (!initial?.id && r.data) router.push(`/hq/service/robots/${r.data.id}`);
        else router.refresh();
      } else toast.error(r.error);
    });
  });
  const onDelete = initial?.id
    ? () => {
        if (!confirm("Delete this robot? Prefer setting it to Retired if it ever ran at a site.")) return;
        start(async () => {
          const r = await deleteRobot(initial.id!);
          if (r.ok) {
            toast.success("Robot deleted");
            onClose();
            router.push("/hq/service/robots");
          } else toast.error(r.error);
        });
      }
    : undefined;

  return (
    <FormSheet open={open} onOpenChange={(o) => !o && onClose()} title={initial?.id ? "Edit robot" : "New robot"} description="One physical unit. Track where it is, who owns it, and when it needs service." formId="robot-form" pending={pending} onDelete={onDelete} submitLabel={initial?.id ? "Save robot" : "Add robot"}>
      <form id="robot-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormRow>
          <Field label="Serial number" required error={form.formState.errors.serialNumber?.message}>
            <Input {...form.register("serialNumber", { required: "Serial number is required." })} placeholder="PUDU-BB-24-00871" autoFocus />
          </Field>
          <Field label="Asset tag">
            <Input {...form.register("assetTag")} placeholder="SR-0042" />
          </Field>
        </FormRow>
        <Field label="Product" hint="Picking a product fills in the model and manufacturer.">
          <Controller
            control={form.control}
            name="product"
            render={({ field }) => (
              <EntityPicker
                type="product"
                value={field.value ?? null}
                onChange={(v) => {
                  field.onChange(v);
                  if (v) {
                    form.setValue("modelName", v.label);
                    const oem = v.sub?.split(" · ")[0]?.trim();
                    if (oem) form.setValue("oem", oem);
                  }
                }}
              />
            )}
          />
        </Field>
        <FormRow>
          <Field label="Model">
            <Input {...form.register("modelName")} placeholder="BellaBot Pro" />
          </Field>
          <Field label="Manufacturer">
            <Input {...form.register("oem")} placeholder="Pudu, RichTech, CenoBots" />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Company">
            <Controller
              control={form.control}
              name="company"
              render={({ field }) => (
                <EntityPicker
                  type="company"
                  value={field.value ?? null}
                  onChange={(v) => {
                    field.onChange(v);
                    form.setValue("site", null);
                  }}
                />
              )}
            />
          </Field>
          <Field label="Site" hint={company ? undefined : "Pick the company to narrow the list."}>
            <Controller control={form.control} name="site" render={({ field }) => <EntityPicker type="site" value={field.value ?? null} onChange={field.onChange} companyId={company?.id} />} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Status">
            <NativeSelect {...form.register("status")}>
              {ROBOT_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Ownership">
            <NativeSelect {...form.register("ownership")}>
              {OWNERSHIPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Install date">
            <Input type="date" {...form.register("installDate")} />
          </Field>
          <Field label="Warranty ends">
            <Input type="date" {...form.register("warrantyEnd")} />
          </Field>
          <Field label="RaaS term ends">
            <Input type="date" {...form.register("raasTermEnd")} />
          </Field>
        </FormRow>
        <FormRow cols={3}>
          <Field label="Last maintenance">
            <Input type="date" {...form.register("lastMaintenance")} />
          </Field>
          <Field label="Service interval (days)" hint="Next service is the last service, or the install date, plus this.">
            <Input type="number" min={1} step="1" {...form.register("maintenanceIntervalDays")} />
          </Field>
          <Field label="Firmware">
            <Input {...form.register("firmwareVersion")} placeholder="3.2.1" />
          </Field>
        </FormRow>
        <Field label="Notes">
          <Textarea {...form.register("notes")} rows={3} placeholder="Route quirks, charging dock location, known issues." />
        </Field>
      </form>
    </FormSheet>
  );
}

// `param` lets a page that already uses ?new=1 for another sheet open this one from a different flag (for example ?newRobot=1).
export function RobotSheetFromUrl({ initial, defaultCompany, defaultSite, defaultInterval, param = "new" }: { initial?: Partial<RobotFormValues>; defaultCompany?: PickerValue; defaultSite?: PickerValue; defaultInterval?: number; param?: string }) {
  const create = useUrlSheet(param);
  const edit = useUrlSheet("edit");
  const sp = useSearchParams();
  const companyId = sp.get("companyId");
  const company = defaultCompany ?? (companyId ? { id: companyId, label: sp.get("companyName") ?? "Selected company" } : null);
  const defaults: Partial<RobotFormValues> = {};
  if (company) defaults.company = company;
  if (defaultSite) defaults.site = defaultSite;
  if (edit.open && initial) return <RobotSheet open onClose={edit.close} initial={initial} defaultInterval={defaultInterval} />;
  return <RobotSheet open={create.open} onClose={create.close} defaults={defaults} defaultInterval={defaultInterval} />;
}
