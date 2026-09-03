"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { TICKET_CATEGORIES } from "@/lib/options";
import { PORTAL_PRIORITIES } from "@/components/hq/service/constants";
import { portalHref } from "@/components/portal/ui";
import { portalCreateTicket, type PortalTicketInput } from "@/server/actions/portal";

export type PortalOption = { id: string; label: string; sub?: string; siteId?: string | null };

export function NewTicketForm({ sites, robots, defaultRobotId, defaultSiteId, preview, onCancelHref }: { sites: PortalOption[]; robots: PortalOption[]; defaultRobotId?: string | null; defaultSiteId?: string | null; preview: string | null; onCancelHref: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const defaultRobot = robots.find((r) => r.id === defaultRobotId);
  const form = useForm<PortalTicketInput>({ defaultValues: { subject: "", description: "", category: "other", priority: "NORMAL", siteId: defaultSiteId ?? defaultRobot?.siteId ?? sites[0]?.id ?? "", robotUnitId: defaultRobotId ?? "" } });
  const priority = form.watch("priority");
  const siteId = form.watch("siteId");
  const visibleRobots = robots.filter((r) => !siteId || !r.siteId || r.siteId === siteId);

  const onSubmit = form.handleSubmit((v) => {
    start(async () => {
      const r = await portalCreateTicket(v, preview);
      if (r.ok && r.data) {
        toast.success(`Ticket ${r.data.number} sent. We will be in touch.`);
        router.push(portalHref(`/portal/support/${r.data.id}`, preview));
        router.refresh();
      } else if (!r.ok) toast.error(r.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 shadow-sm md:p-6">
      <Field label="What is the problem?" required error={form.formState.errors.subject?.message}>
        <Input {...form.register("subject", { required: "Give us a short summary of the problem." })} autoFocus placeholder="The robot stops in the hallway near room 210" className="h-11 text-[15px]" />
      </Field>
      <Field label="Tell us more" hint="When it started, how often it happens, anything you already tried. Photos can be emailed to your Spectrum contact.">
        <Textarea {...form.register("description")} rows={5} className="text-[15px]" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="What kind of issue?">
          <NativeSelect {...form.register("category")} className="h-11 text-[15px]">
            {TICKET_CATEGORIES.filter((c) => c.value !== "onboarding").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Which location?">
          <NativeSelect {...form.register("siteId")} className="h-11 text-[15px]" disabled={sites.length === 0}>
            {sites.length === 0 ? <option value="">No locations on file</option> : null}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Which robot?" hint="Optional. Pick it if you know which unit is affected.">
        <NativeSelect {...form.register("robotUnitId")} className="h-11 text-[15px]" disabled={robots.length === 0}>
          <option value="">{robots.length === 0 ? "No robots on file" : "Not sure or not about one robot"}</option>
          {visibleRobots.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
              {r.sub ? ` (${r.sub})` : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">How urgent is it?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {PORTAL_PRIORITIES.map((p) => (
            <label key={p.value} className={cn("flex cursor-pointer flex-col gap-1 rounded-xl border p-3.5 transition-colors", priority === p.value ? "border-brand bg-brand-mist ring-2 ring-brand/20" : "border-line hover:border-line-strong")}>
              <span className="flex items-center gap-2">
                <input type="radio" value={p.value} {...form.register("priority")} className="accent-brand" />
                <span className="text-[15px] font-semibold text-ink">{p.label}</span>
              </span>
              <span className="text-[13px] leading-snug text-muted">{p.description}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">Something dangerous or a whole site down? Call (630) 809-9698 right away, then open the ticket.</p>
      </fieldset>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <Button asChild variant="secondary" size="lg">
          <a href={onCancelHref}>Cancel</a>
        </Button>
        <Button type="submit" size="lg" loading={pending}>
          Send ticket
        </Button>
      </div>
    </form>
  );
}
