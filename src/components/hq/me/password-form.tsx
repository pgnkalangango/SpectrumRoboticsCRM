"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Panel } from "@/components/hq/record";
import { changePassword } from "@/server/actions/me";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [pending, start] = React.useTransition();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const mismatch = confirm.length > 0 && next !== confirm;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("The new passwords do not match.");
      return;
    }
    start(async () => {
      const r = await changePassword(current, next);
      if (r.ok) {
        toast.success("Password updated");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else toast.error(r.error);
    });
  };
  return (
    <Panel title={hasPassword ? "Change password" : "Set a password"}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {!hasPassword ? <p className="text-xs text-muted">You sign in with Microsoft or Google. Setting a password lets you sign in with email too.</p> : null}
        {hasPassword ? (
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
        ) : null}
        <Field label="New password" hint="At least 10 characters.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} />
        </Field>
        <Field label="Confirm new password" error={mismatch ? "Does not match." : undefined}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="secondary" loading={pending} disabled={!next || mismatch}>
            Update password
          </Button>
        </div>
      </form>
    </Panel>
  );
}
