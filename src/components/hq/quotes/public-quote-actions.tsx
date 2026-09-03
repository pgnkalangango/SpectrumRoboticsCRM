"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { acceptQuote, declineQuote } from "@/server/actions/quotes";

export function PublicQuoteActions({ token, number, contactName }: { token: string; number: string; contactName: string | null }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"accept" | "decline">("accept");
  const [name, setName] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();
  const [done, setDone] = React.useState<null | "accepted" | "declined">(null);

  const submitAccept = () => {
    if (name.trim().length < 2) return toast.error("Type your full name to accept.");
    if (!agreed) return toast.error("Please confirm you agree to the terms.");
    start(async () => {
      const r = await acceptQuote(token, name.trim(), agreed);
      if (r.ok) {
        setDone("accepted");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  const submitDecline = () => {
    start(async () => {
      const r = await declineQuote(token, reason);
      if (r.ok) {
        setDone("declined");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  if (done === "accepted")
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-2 size-9 text-ok" />
        <h3 className="font-display text-lg font-bold text-ink">Thank you, {name.trim().split(" ")[0]}</h3>
        <p className="mt-1 text-sm text-muted">Quote {number} is accepted. Your Spectrum Robotics rep will follow up with the invoice and next steps.</p>
      </div>
    );
  if (done === "declined")
    return (
      <div className="rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
        <h3 className="font-display text-lg font-bold text-ink">Thanks for letting us know</h3>
        <p className="mt-1 text-sm text-muted">We have passed your note to your rep. If anything changes, they can send an updated quote.</p>
      </div>
    );

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex rounded-lg bg-surface-2 p-1">
        <button type="button" onClick={() => setMode("accept")} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${mode === "accept" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          Accept quote
        </button>
        <button type="button" onClick={() => setMode("decline")} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${mode === "decline" ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
          Decline
        </button>
      </div>
      {mode === "accept" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">Typing your name below acts as your signature and confirms you are authorized to accept on behalf of your organization.</p>
          <Field label="Your full name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={contactName ?? "First and last name"} autoComplete="name" />
          </Field>
          <label className="flex items-start gap-2.5 text-sm text-ink-2">
            <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
            <span>I have read the quote and agree to the terms shown above.</span>
          </label>
          <Button size="lg" onClick={submitAccept} disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Accept quote {number}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Anything you would like us to know?" hint="Optional. Pricing, timing or a different configuration, we are happy to adjust.">
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button size="lg" variant="secondary" onClick={submitDecline} disabled={pending} className="w-full">
            {pending ? <Loader2 className="animate-spin" /> : null} Decline this quote
          </Button>
        </div>
      )}
    </div>
  );
}
