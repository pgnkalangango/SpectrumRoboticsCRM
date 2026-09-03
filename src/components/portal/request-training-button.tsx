"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { portalHref } from "@/components/portal/ui";
import { portalRequestTraining } from "@/server/actions/portal";

export function RequestTrainingButton({ preview }: { preview: string | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <GraduationCap /> Request training
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Request a training session</DialogTitle>
            <DialogDescription>We will open a support ticket and your Spectrum contact will reach out to set a date.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Who needs training, and when works?" hint="Optional, but it helps us plan.">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} autoFocus placeholder="Three new servers on the evening shift. Any weekday after 2pm." className="text-[15px]" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await portalRequestTraining(note, preview);
                  if (r.ok && r.data) {
                    toast.success("Request sent. We will be in touch to set a date.");
                    setOpen(false);
                    router.push(portalHref(`/portal/support/${r.data.id}`, preview));
                    router.refresh();
                  } else if (!r.ok) toast.error(r.error);
                })
              }
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
