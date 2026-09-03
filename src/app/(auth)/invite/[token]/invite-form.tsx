"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { acceptInvitation, type ActionResult } from "@/server/actions/auth";

export function InviteForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(acceptInvitation, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Your name" required>
        <Input name="name" defaultValue={defaultName} autoComplete="name" required autoFocus />
      </Field>
      <Field label="Password" hint="At least 10 characters." required>
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      {state && !state.ok ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p> : null}
      <Button type="submit" size="lg" loading={pending} className="w-full">
        Create my account
      </Button>
    </form>
  );
}
