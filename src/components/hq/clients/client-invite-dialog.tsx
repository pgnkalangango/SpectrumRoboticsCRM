"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { inviteClientUser } from "@/server/actions/clients";
import type { ShareLink } from "@/components/hq/clients/copy-link-dialog";

type FormValues = { company: PickerValue; name: string; email: string; contact: PickerValue };

export function ClientInviteDialog({ open, onClose, company, onInvited }: { open: boolean; onClose: () => void; company: PickerValue; onInvited: (link: ShareLink) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<FormValues>({ defaultValues: { company, name: "", email: "", contact: null } });
  React.useEffect(() => {
    if (open) form.reset({ company, name: "", email: "", contact: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, company?.id]);
  const picked = form.watch("company");
  const contact = form.watch("contact");
  React.useEffect(() => {
    // Picking a contact fills the name and email so the invite matches the CRM record.
    if (contact?.label && !form.getValues("name")) form.setValue("name", contact.label);
    if (contact?.sub && contact.sub.includes("@") && !form.getValues("email")) form.setValue("email", contact.sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  const submit = form.handleSubmit((v) => {
    if (!v.company) {
      form.setError("company", { message: "Pick the company." });
      return;
    }
    start(async () => {
      const r = await inviteClientUser({ companyId: v.company!.id, name: v.name, email: v.email, contactId: v.contact?.id ?? null });
      if (r.ok && r.data) {
        toast.success(r.data.delivered ? "Invitation sent" : "Invitation created");
        onInvited({ title: "Portal invitation link", url: r.data.inviteUrl, delivered: r.data.delivered });
        onClose();
        router.refresh();
      } else if (!r.ok) toast.error(r.error);
    });
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Invite a portal user</DialogTitle>
            <DialogDescription>They get an email with a link to choose a password. Portal access for the company turns on automatically.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Company" required error={form.formState.errors.company?.message}>
              <Controller control={form.control} name="company" render={({ field }) => <EntityPicker type="company" value={field.value} onChange={(v) => { field.onChange(v); form.setValue("contact", null); }} />} />
            </Field>
            <Field label="Existing contact" hint="Optional. Links the login to a person already in the CRM.">
              <Controller control={form.control} name="contact" render={({ field }) => <EntityPicker type="contact" value={field.value} onChange={field.onChange} companyId={picked?.id} disabled={!picked} placeholder={picked ? "Pick a contact or leave empty" : "Pick the company first"} />} />
            </Field>
            <Field label="Name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name", { required: "Enter their name." })} placeholder="Alex Rivera" />
            </Field>
            <Field label="Email" required error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email", { required: "Enter their email." })} placeholder="alex@customer.com" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
