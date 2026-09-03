"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { forgotPassword, type ActionResult } from "@/server/actions/auth";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(forgotPassword, null);
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-[26px] font-bold text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">Enter your email and we will send a link to choose a new one.</p>
      </div>
      {state?.ok ? (
        <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <Field label="Email">
            <Input name="email" type="email" required autoFocus />
          </Field>
          {state && !state.ok ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p> : null}
          <Button type="submit" size="lg" loading={pending} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
