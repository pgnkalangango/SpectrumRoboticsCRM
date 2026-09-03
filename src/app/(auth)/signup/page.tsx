"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { clientSignup, type ActionResult } from "@/server/actions/auth";

export default function SignupPage() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(clientSignup, null);
  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  if (state?.ok) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-ok" />
        <h1 className="font-display text-2xl font-bold">You are almost in</h1>
        <p className="mt-2 text-sm text-muted">{state.message}</p>
        <Button asChild className="mt-6">
          <Link href="/login?as=client">Go to sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6">
        <div className="eyebrow mb-2">Client portal</div>
        <h1 className="font-display text-[26px] font-bold text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-muted">See your quotes, pay invoices, track your robots and open support tickets in one place.</p>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Your name" error={fields.name} required>
          <Input name="name" autoComplete="name" placeholder="First and last name" required />
        </Field>
        <Field label="Work email" error={fields.email} hint="Use your company email so we can match you to your account." required>
          <Input name="email" type="email" autoComplete="email" placeholder="you@yourcompany.com" required />
        </Field>
        <Field label="Company" error={fields.company} required>
          <Input name="company" autoComplete="organization" placeholder="Company or venue name" required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" error={fields.phone}>
            <Input name="phone" type="tel" autoComplete="tel" placeholder="Optional" />
          </Field>
          <Field label="Client code" error={fields.clientCode} hint="If your rep gave you one.">
            <Input name="clientCode" placeholder="Optional" className="uppercase" />
          </Field>
        </div>
        <Field label="Password" error={fields.password} hint="At least 10 characters." required>
          <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        {state && !state.ok ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p> : null}
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Create account
        </Button>
        <p className="text-center text-xs text-muted">By creating an account you agree to Spectrum Robotics&apos; terms of service and privacy policy.</p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login?as=client" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
