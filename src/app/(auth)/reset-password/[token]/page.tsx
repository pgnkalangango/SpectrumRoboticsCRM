"use client";

import { useActionState } from "react";
import { use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { resetPassword, type ActionResult } from "@/server/actions/auth";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(resetPassword, null);
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-[26px] font-bold text-ink">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">At least 10 characters. A short sentence works well.</p>
      </div>
      {state?.ok ? (
        <div>
          <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>
          <Button asChild className="mt-4 w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <Field label="New password">
            <Input name="password" type="password" autoComplete="new-password" required minLength={10} autoFocus />
          </Field>
          {state && !state.ok ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p> : null}
          <Button type="submit" size="lg" loading={pending} className="w-full">
            Save password
          </Button>
        </form>
      )}
    </div>
  );
}
