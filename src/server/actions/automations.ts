"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, AccessDenied } from "@/lib/session";
import { audit } from "@/lib/audit";
import { Prisma } from "@/generated/prisma/client";
import { runAutomationNow } from "@/lib/automations/engine";
import { isValidCron, parseActions, parseConditions, parseTrigger, TRIGGER_DEFS, type AutomationAction, type Condition, type Trigger } from "@/lib/automations/triggers";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: e instanceof Error && e.message ? e.message : "Something went wrong. Please try again." };
}

const refresh = () => revalidatePath("/hq/automations");

const automationSchema = z.object({
  name: z.string().min(1, "Give the automation a name.").max(160),
  description: z.string().max(1000).optional().nullable(),
  enabled: z.boolean().default(true),
  trigger: z.object({ type: z.string() }).passthrough(),
  conditions: z.array(z.object({ field: z.enum(["owner", "industry"]), value: z.string() })).optional(),
  actions: z.array(z.object({ type: z.string() }).passthrough()).min(1, "Add at least one action."),
});
export type AutomationInput = z.input<typeof automationSchema>;

function cleanTrigger(raw: Trigger): Record<string, unknown> {
  const def = TRIGGER_DEFS.find((d) => d.type === raw.type);
  const out: Record<string, unknown> = { type: raw.type };
  for (const f of def?.fields ?? []) {
    const v = raw[f.key];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[f.key] = v;
  }
  return out;
}

function cleanActions(actions: AutomationAction[]): Record<string, unknown>[] {
  return actions.map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== "" && v !== null)));
}

export async function saveAutomation(input: AutomationInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("automations.manage");
    const d = automationSchema.parse(input);
    const trigger = parseTrigger(d.trigger);
    if (trigger.type === "schedule" && (!trigger.cron || !isValidCron(trigger.cron))) return { ok: false, error: "Enter a valid cron schedule with five fields, for example 0 13 * * 1." };
    if (trigger.type === "invoice.overdue" && !(trigger.days?.length)) return { ok: false, error: "List at least one day offset, for example 1, 7, 14." };
    if (trigger.type === "deal.stage_changed" && !trigger.to) return { ok: false, error: "Enter the stage key the deal moves to." };
    const actions = parseActions(d.actions);
    for (const a of actions) {
      if (a.type === "create_task" && !a.title) return { ok: false, error: "Every task action needs a title." };
      if ((a.type === "notify_tier" || a.type === "notify_department") && !a.title) return { ok: false, error: "Notifications need a title." };
      if (a.type === "slack" && !a.text) return { ok: false, error: "The Slack action needs a message." };
      if (a.type === "email" && (!a.subject || !a.toRole)) return { ok: false, error: "The email action needs a recipient and a subject." };
    }
    const conditions: Condition[] = parseConditions(d.conditions);
    const conditionsJson = conditions.length ? (conditions as unknown as Prisma.InputJsonValue) : undefined;
    const data = { name: d.name, description: d.description ?? null, enabled: d.enabled, trigger: cleanTrigger(trigger) as Prisma.InputJsonValue, conditions: conditionsJson, actions: cleanActions(actions) as Prisma.InputJsonValue };
    let id = input.id;
    if (id) {
      const before = await prisma.automation.findUnique({ where: { id } });
      await prisma.automation.update({ where: { id }, data: { ...data, conditions: conditionsJson ?? Prisma.JsonNull } });
      await audit({ actorId: user.id, action: "update", entityType: "Automation", entityId: id, before: before ? { trigger: before.trigger, actions: before.actions, enabled: before.enabled } : undefined, after: data });
    } else {
      const row = await prisma.automation.create({ data: { ...data, createdById: user.id } });
      id = row.id;
      await audit({ actorId: user.id, action: "create", entityType: "Automation", entityId: id, after: data });
    }
    refresh();
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<Result> {
  try {
    const user = await actionCan("automations.manage");
    await prisma.automation.update({ where: { id }, data: { enabled } });
    await audit({ actorId: user.id, action: enabled ? "enable" : "disable", entityType: "Automation", entityId: id, after: { enabled } });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAutomation(id: string): Promise<Result> {
  try {
    const user = await actionCan("automations.manage");
    const before = await prisma.automation.findUnique({ where: { id } });
    await prisma.automation.delete({ where: { id } });
    await audit({ actorId: user.id, action: "delete", entityType: "Automation", entityId: id, before: before ? { name: before.name, trigger: before.trigger } : undefined });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function runAutomation(id: string): Promise<Result<{ matched: number; ran: number; skipped: number; errors: number; notes: string[] }>> {
  try {
    const user = await actionCan("automations.manage");
    const r = await runAutomationNow(id);
    await audit({ actorId: user.id, action: "run_now", entityType: "Automation", entityId: id, after: { matched: r.matched, ran: r.ran, errors: r.errors } });
    refresh();
    revalidatePath("/hq/tasks");
    revalidatePath("/hq");
    return { ok: true, data: { matched: r.matched, ran: r.ran, skipped: r.skipped, errors: r.errors, notes: r.notes } };
  } catch (e) {
    return fail(e);
  }
}
