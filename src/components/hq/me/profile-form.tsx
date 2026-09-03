"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { Check, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AVATAR_COLORS, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Panel } from "@/components/hq/record";
import { updateMe } from "@/server/actions/me";

export const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain, no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

export type ProfileInitial = { name: string; email: string; image: string | null; title: string | null; phone: string | null; bookingLink: string | null; territory: string | null; timezone: string; avatarColor: string | null; signatureHtml: string | null; voiceProfile: string | null };
export type CompanyInfo = { name: string; address: string; phone: string; website: string; tagline: string };

type FormValues = { name: string; title: string; phone: string; bookingLink: string; territory: string; timezone: string; avatarColor: string; signatureHtml: string; voiceProfile: string };

export function standardSignature(v: { name: string; title: string; phone: string; bookingLink: string }, company: CompanyInfo): string {
  const lines = [
    `<p style="margin:0;font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#141517;line-height:1.5">`,
    `<strong>${v.name}</strong>${v.title ? `<br/>${v.title}, ${company.name}` : `<br/>${company.name}`}`,
    v.phone ? `<br/>${v.phone}` : "",
    v.bookingLink ? `<br/><a href="${v.bookingLink}" style="color:#149CA0">Book a 15 minute call</a>` : "",
    `<br/><a href="${company.website}" style="color:#149CA0">${company.website.replace(/^https?:\/\//, "")}</a>`,
    `<br/><span style="color:#6e7780;font-size:12px">${company.address}</span>`,
    `</p>`,
  ];
  return lines.filter(Boolean).join("");
}

export function ProfileForm({ initial, company }: { initial: ProfileInitial; company: CompanyInfo }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<FormValues>({
    defaultValues: { name: initial.name, title: initial.title ?? "", phone: initial.phone ?? "", bookingLink: initial.bookingLink ?? "", territory: initial.territory ?? "", timezone: initial.timezone, avatarColor: initial.avatarColor ?? "", signatureHtml: initial.signatureHtml ?? "", voiceProfile: initial.voiceProfile ?? "" },
  });
  const name = form.watch("name");
  const color = form.watch("avatarColor");
  const signature = form.watch("signatureHtml");
  const submit = form.handleSubmit((v) =>
    start(async () => {
      const r = await updateMe({ ...v, title: v.title || null, phone: v.phone || null, bookingLink: v.bookingLink || null, territory: v.territory || null, avatarColor: v.avatarColor || null, signatureHtml: v.signatureHtml || null, voiceProfile: v.voiceProfile || null });
      if (r.ok) {
        toast.success("Profile saved");
        form.reset(v);
        router.refresh();
      } else toast.error(r.error);
    }),
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Panel title="About you">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={name || "?"} src={initial.image} color={color || null} size={56} />
            <div>
              <div className="text-[13px] font-semibold text-ink-2">Avatar color</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Controller
                  control={form.control}
                  name="avatarColor"
                  render={({ field }) => (
                    <>
                      {AVATAR_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => field.onChange(c)} className={cn("flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110", field.value === c && "ring-2 ring-ink")} style={{ background: c }} aria-label={`Use ${c}`}>
                          {field.value === c ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
                        </button>
                      ))}
                      <button type="button" onClick={() => field.onChange("")} className={cn("h-7 rounded-full border border-line px-2 text-[11px] text-muted hover:text-ink", !field.value && "border-ink text-ink")}>
                        Auto
                      </button>
                    </>
                  )}
                />
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name", { required: "Enter your name." })} />
            </Field>
            <Field label="Email" hint="Owners change email addresses from Team.">
              <Input value={initial.email} disabled />
            </Field>
            <Field label="Job title">
              <Input {...form.register("title")} placeholder="Account Executive" />
            </Field>
            <Field label="Phone">
              <Input {...form.register("phone")} placeholder="(630) 809-9698" />
            </Field>
            <Field label="Booking link" hint="Goes in your signature and every outreach draft.">
              <Input {...form.register("bookingLink")} placeholder="https://calendly.com/you/15min" />
            </Field>
            <Field label="Territory">
              <Input {...form.register("territory")} placeholder="Chicagoland" />
            </Field>
            <Field label="Time zone">
              <NativeSelect {...form.register("timezone")}>
                {US_TIMEZONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
      </Panel>

      <Panel
        title="Email signature"
        action={
          <Button type="button" size="sm" variant="secondary" onClick={() => form.setValue("signatureHtml", standardSignature({ name: form.getValues("name"), title: form.getValues("title"), phone: form.getValues("phone"), bookingLink: form.getValues("bookingLink") }, company), { shouldDirty: true })}>
            <Wand2 /> Use the company standard
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="HTML" hint="Plain HTML. Keep it short: name, title, phone, booking link, address.">
            <Textarea rows={9} {...form.register("signatureHtml")} className="font-mono text-xs" placeholder="<p><strong>Your name</strong><br/>Title, Spectrum Robotics</p>" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">Preview</span>
            <div className="min-h-[120px] flex-1 rounded-lg border border-line bg-white p-4 text-sm text-[#141517]">{signature ? <div dangerouslySetInnerHTML={{ __html: signature }} /> : <span className="text-faint">Your signature shows here.</span>}</div>
          </div>
        </div>
      </Panel>

      <Panel title="Writing voice">
        <Field hint="Paste the voice profile the assistant should use when it drafts as you: tone, sentence length, words you use and avoid, how you open and close. The more specific, the closer the drafts.">
          <Textarea rows={10} {...form.register("voiceProfile")} placeholder={"Example:\n- Short sentences, plain words, no jargon.\n- Open with the point, not a greeting paragraph.\n- Never use em dashes or exclamation marks.\n- Close with one clear ask and my booking link."} />
        </Field>
      </Panel>

      <div className="flex items-center justify-end gap-2">
        {form.formState.isDirty ? <span className="text-xs text-muted">Unsaved changes</span> : null}
        <Button type="submit" loading={pending} disabled={!form.formState.isDirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
