"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { portalAcceptQuote, portalDeclineQuote } from "@/server/actions/portal";

export function QuoteResponse({ quoteId, quoteNumber, defaultName, preview }: { quoteId: string; quoteNumber: string; defaultName: string; preview: string | null }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"accept" | "decline" | null>(null);
  const [name, setName] = React.useState(defaultName);
  const [agree, setAgree] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();

  const accept = () =>
    start(async () => {
      const r = await portalAcceptQuote(quoteId, name, preview);
      if (r.ok) {
        toast.success("Thank you. Your quote is accepted and your Spectrum contact has been notified.");
        setMode(null);
        router.refresh();
      } else toast.error(r.error);
    });
  const decline = () =>
    start(async () => {
      const r = await portalDeclineQuote(quoteId, reason, preview);
      if (r.ok) {
        toast.success("Got it. We have let your Spectrum contact know.");
        setMode(null);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="rounded-2xl border border-brand/30 bg-brand-mist p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Ready to decide?</h2>
      <p className="mt-1 text-[15px] text-ink-2">Accepting {quoteNumber} tells us to start scheduling. You will get an invoice next. Not the right fit? Decline and tell us why so we can adjust.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="lg" onClick={() => setMode("accept")}>
          <CheckCircle2 /> Accept this quote
        </Button>
        <Button size="lg" variant="secondary" onClick={() => setMode("decline")}>
          <XCircle /> Decline
        </Button>
      </div>

      <Dialog open={mode === "accept"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Accept quote {quoteNumber}</DialogTitle>
            <DialogDescription>Type your full name to sign. This counts as your acceptance of the quote and its terms.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Your full name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-11 text-[15px]" />
            </Field>
            <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-[15px] leading-snug">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} className="mt-0.5" />
              <span>I have read the quote and agree to the pricing and terms shown.</span>
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button loading={pending} disabled={!agree || name.trim().length < 2} onClick={accept}>
              Accept and sign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "decline"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Decline quote {quoteNumber}</DialogTitle>
            <DialogDescription>A sentence or two helps us come back with something that fits.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field label="Why is this not right for you?" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} autoFocus placeholder="The price is more than we budgeted. We may revisit next quarter." className="text-[15px]" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={pending} disabled={!reason.trim()} onClick={decline}>
              Decline quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
