"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Award, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { FormRow } from "@/components/hq/form-sheet";
import { DOCUMENT_CATEGORIES } from "@/components/hq/service/constants";
import { addSiteDocument, deleteDocument, issueCertificate, type CertificateInput, type DocumentInput } from "@/server/actions/service";

export function IssueCertificateButton({ siteId, robotModels }: { siteId: string; robotModels: string[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const form = useForm<CertificateInput>({ defaultValues: { traineeName: "", traineeEmail: "", robotModel: robotModels[0] ?? "", score: null } });
  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await issueCertificate(siteId, v);
      if (r.ok) {
        toast.success(`Certificate ${r.data?.certificateNumber} issued`);
        setOpen(false);
        form.reset({ traineeName: "", traineeEmail: "", robotModel: robotModels[0] ?? "", score: null });
        router.refresh();
      } else toast.error(r.error);
    });
  });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Award /> Issue certificate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Issue a training certificate</DialogTitle>
              <DialogDescription>For an operator who completed training at this site. The certificate shows in the client portal and is valid for one year.</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <FormRow>
                <Field label="Trainee name" required error={form.formState.errors.traineeName?.message}>
                  <Input {...form.register("traineeName", { required: "Who was trained?" })} autoFocus placeholder="Maria Lopez" />
                </Field>
                <Field label="Trainee email">
                  <Input type="email" {...form.register("traineeEmail")} placeholder="maria@company.com" />
                </Field>
              </FormRow>
              <FormRow>
                <Field label="Robot model">
                  {robotModels.length ? (
                    <NativeSelect {...form.register("robotModel")}>
                      {robotModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="">Other</option>
                    </NativeSelect>
                  ) : (
                    <Input {...form.register("robotModel")} placeholder="BellaBot Pro" />
                  )}
                </Field>
                <Field label="Score (%)" hint="Optional, 0 to 100">
                  <Input type="number" min={0} max={100} step="1" {...form.register("score")} />
                </Field>
              </FormRow>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Issue certificate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddDocumentButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const form = useForm<DocumentInput>({ defaultValues: { name: "", url: "", category: "general", clientVisible: false } });
  const clientVisible = form.watch("clientVisible");
  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await addSiteDocument(siteId, v);
      if (r.ok) {
        toast.success("Document added");
        setOpen(false);
        form.reset({ name: "", url: "", category: "general", clientVisible: false });
        router.refresh();
      } else toast.error(r.error);
    });
  });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileUp /> Add document
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Add a document</DialogTitle>
              <DialogDescription>Link a file that lives in SharePoint, Google Drive or the OEM portal. File upload storage is coming, so for now paste the link.</DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <Field label="Name" required error={form.formState.errors.name?.message}>
                <Input {...form.register("name", { required: "Give the document a name." })} autoFocus placeholder="Site survey report, March" />
              </Field>
              <Field label="Link" required error={form.formState.errors.url?.message}>
                <Input {...form.register("url", { required: "Paste the link." })} placeholder="https://…" />
              </Field>
              <Field label="Category">
                <NativeSelect {...form.register("category")}>
                  {DOCUMENT_CATEGORIES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">Show in the client portal</span>
                  <span className="block text-xs text-muted">Manuals, certificates and signed contracts usually should be. Internal survey notes should not.</span>
                </span>
                <Switch checked={!!clientVisible} onCheckedChange={(v) => form.setValue("clientVisible", v)} />
              </label>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Add document
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteDocumentButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      className="rounded p-1 text-muted hover:bg-bad-soft hover:text-bad disabled:opacity-50"
      aria-label="Remove document"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove this document link?")) return;
        start(async () => {
          const r = await deleteDocument(id);
          if (r.ok) {
            toast.success("Document removed");
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
