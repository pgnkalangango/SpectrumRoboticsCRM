"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { signInWithPassword, signInWithProvider, type ActionResult } from "@/server/actions/auth";

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function LoginForm({ next, providers, asClient }: { next?: string; providers: { microsoft: boolean; google: boolean }; asClient: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(signInWithPassword, null);
  const target = next ?? (asClient ? "/portal" : "/hq");
  const anyOAuth = providers.microsoft || providers.google;
  return (
    <div className="flex flex-col gap-5">
      {anyOAuth ? (
        <div className="flex flex-col gap-2">
          {providers.microsoft ? (
            <form action={() => signInWithProvider("microsoft-entra-id", target)}>
              <Button type="submit" variant="secondary" size="lg" className="w-full">
                <MicrosoftMark /> Continue with Microsoft 365
              </Button>
            </form>
          ) : null}
          {providers.google ? (
            <form action={() => signInWithProvider("google", target)}>
              <Button type="submit" variant="secondary" size="lg" className="w-full">
                <GoogleMark /> Continue with Google
              </Button>
            </form>
          ) : null}
          <div className="relative my-1 text-center text-xs text-faint before:absolute before:left-0 before:top-1/2 before:h-px before:w-[45%] before:bg-line after:absolute after:right-0 after:top-1/2 after:h-px after:w-[45%] after:bg-line">or</div>
        </div>
      ) : null}
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={target} />
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required autoFocus />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" placeholder="Your password" required />
        </Field>
        {state && !state.ok ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p> : null}
        <Button type="submit" size="lg" loading={pending} className="w-full">
          Sign in
        </Button>
        <Link href="/forgot-password" className="text-center text-sm text-muted hover:text-ink hover:underline">
          Forgot your password?
        </Link>
      </form>
    </div>
  );
}
