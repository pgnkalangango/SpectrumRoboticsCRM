"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { TIMEZONES } from "@/components/hq/service/constants";
import { portalChangePassword, portalUpdateProfile, type ProfileInput } from "@/server/actions/portal";

export function ProfileForm({ initial }: { initial: ProfileInput }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<ProfileInput>({ defaultValues: initial });
  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await portalUpdateProfile(v);
      if (r.ok) {
        toast.success("Profile saved");
        form.reset(v);
        router.refresh();
      } else toast.error(r.error);
    });
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Your name" required error={form.formState.errors.name?.message}>
        <Input {...form.register("name", { required: "Enter your name." })} className="h-11 text-[15px]" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" hint="Best number for a technician to reach you.">
          <Input type="tel" {...form.register("phone")} className="h-11 text-[15px]" placeholder="(630) 555-0100" />
        </Field>
        <Field label="Time zone">
          <NativeSelect {...form.register("timezone")} className="h-11 text-[15px]">
            {TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending} disabled={!form.formState.isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, start] = React.useTransition();
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = (!hasPassword || current.length > 0) && next.length >= 10 && next === confirm;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        start(async () => {
          const r = await portalChangePassword(current, next);
          if (r.ok) {
            toast.success("Password changed");
            setCurrent("");
            setNext("");
            setConfirm("");
          } else toast.error(r.error);
        });
      }}
      className="flex flex-col gap-4"
    >
      {hasPassword ? (
        <Field label="Current password" required>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-11 text-[15px]" />
        </Field>
      ) : (
        <p className="text-[14px] text-muted">You signed in with a link or a Microsoft or Google account. Set a password here if you would like to use one.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" required hint="At least 10 characters.">
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="h-11 text-[15px]" />
        </Field>
        <Field label="Type it again" required error={mismatch ? "The two passwords do not match." : undefined}>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-11 text-[15px]" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg" variant="secondary" loading={pending} disabled={!ready}>
          {hasPassword ? "Change password" : "Set password"}
        </Button>
      </div>
    </form>
  );
}
