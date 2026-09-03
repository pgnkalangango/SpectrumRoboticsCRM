"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { requestAccess, type ActionResult } from "@/server/actions/auth";

function RequestAccessForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(requestAccess, null);
  const sp = useSearchParams();
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  if (state?.ok) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-ok" />
        <h1 className="font-display text-2xl font-bold">Request sent</h1>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-2">Spectrum HQ</div>
        <h1 className="font-display text-[26px] font-bold text-ink">Request access</h1>
        <p className="mt-1 text-sm text-muted">
          {sp.get("reason") === "no-account" ? "That account is not set up yet. Tell us who you are and an owner will invite you." : "Team members are added by an owner. Send a request and we will set you up."}
        </p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Your name" error={fields.name} required>
          <Input name="name" placeholder="First and last name" required />
        </Field>
        <Field label="Email" error={fields.email} required>
          <Input name="email" type="email" placeholder="you@spectrumrobotics.ai" required />
        </Field>
        <Field label="I am a" error={fields.kind}>
          <NativeSelect name="kind" defaultValue="STAFF">
            <option value="STAFF">Spectrum Robotics team member</option>
            <option value="CLIENT">Client or partner</option>
          </NativeSelect>
        </Field>
        <Field label="Company" error={fields.company}>
          <Input name="company" placeholder="Spectrum Robotics" />
        </Field>
        <Field label="Why do you need access?" error={fields.reason}>
          <Textarea name="reason" rows={3} placeholder="A sentence is enough." />
        </Field>
        {state && !state.ok ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p> : null}
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Send request
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function RequestAccessPage() {
  return (
    <Suspense>
      <RequestAccessForm />
    </Suspense>
  );
}
