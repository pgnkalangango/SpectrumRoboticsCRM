"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FormRow } from "@/components/hq/form-sheet";
import { MAINTENANCE_TYPES, toDateTimeInput } from "@/components/hq/service/constants";
import { logMaintenance, type MaintenanceInput } from "@/server/actions/service";

export function LogMaintenanceButton({ robotId, intervalDays }: { robotId: string; intervalDays: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const form = useForm<MaintenanceInput>({ defaultValues: { type: "scheduled", performedAt: toDateTimeInput(new Date()), notes: "", partsUsed: "" } });
  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await logMaintenance(robotId, v);
      if (r.ok) {
        toast.success("Maintenance logged. Next service date updated.");
        setOpen(false);
        form.reset({ type: "scheduled", performedAt: toDateTimeInput(new Date()), notes: "", partsUsed: "" });
        router.refresh();
      } else toast.error(r.error);
    });
  });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Wrench /> Log maintenance
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Log maintenance</DialogTitle>
              <DialogDescription>Record the visit. The next service date moves out by {intervalDays} days from this visit.</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <FormRow>
                <Field label="Type">
                  <NativeSelect {...form.register("type")}>
                    {MAINTENANCE_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Performed at">
                  <Input type="datetime-local" {...form.register("performedAt")} />
                </Field>
              </FormRow>
              <Field label="What was done">
                <Textarea {...form.register("notes")} rows={4} autoFocus placeholder="Cleaned sensors and wheels, checked battery health (92%), updated map for the new patio route." />
              </Field>
              <Field label="Parts used" hint="One per line or comma separated.">
                <Textarea {...form.register("partsUsed")} rows={2} placeholder="Drive wheel, tray bracket" />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Save log
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
