"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, AccessDenied } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getSetting, setSetting, type SettingsMap } from "@/lib/settings";
import { slugify } from "@/lib/utils";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const str = (max = 300) => z.string().max(max).default("");
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const list = z.array(z.string().max(300)).transform((a) => a.map((s) => s.trim()).filter(Boolean));

// One schema per settings group. Counters are never editable here; nextNumber() owns them.
const SCHEMAS = {
  company: z.object({ name: z.string().min(1, "Company name is required.").max(120), legalName: str(160), address: str(300), phone: str(40), email: z.string().email("Enter a valid email.").or(z.literal("")), website: str(300), tagline: str(200), sendDomain: str(120), sendFromName: str(120), timezone: str(60) }),
  quotes: z.object({ prefix: z.string().min(1).max(10), validityDays: int(1, 365), taxRate: z.coerce.number().min(0).max(100), defaultTerms: str(4000), discountPolicy: z.enum(["owners_only", "leadership", "anyone"]), pdfFooter: str(500) }),
  invoices: z.object({ prefix: z.string().min(1).max(10), defaultTerms: str(120), overdueGraceDays: int(0, 90) }),
  tickets: z.object({ prefix: z.string().min(1).max(10) }),
  pipeline: z.object({ staleDays: int(1, 365), requireNextStep: z.boolean() }),
  pricingLanguage: z.object({ publicPrefix: str(40), raasFrom: z.coerce.number().min(0), purchaseFrom: z.coerce.number().min(0), hideFinancedFigure: z.boolean() }),
  email: z.object({ footerHtml: str(5000), maxOutreachWords: int(20, 1000), targetOutreachWords: str(40) }),
  service: z.object({ slaHours: z.object({ CRITICAL: int(1, 720), HIGH: int(1, 720), NORMAL: int(1, 720), LOW: int(1, 720) }), maintenanceIntervalDays: int(1, 730), renewalAlertDays: int(1, 365) }),
  assistant: z.object({ model: z.string().min(1).max(80), maxTokens: int(256, 64000), rules: list }),
  leads: z.object({ defaultOwnerEmail: z.string().email().or(z.literal("")), notifyEmails: z.array(z.string().email("One of the notify emails is not valid.")), autoDeal: z.boolean() }),
  followUp: z.object({ replyWithinDays: z.number().int().min(1).max(30), waitingOnThemDays: z.number().int().min(1).max(60), quietDays: z.number().int().min(7).max(365), leadMinExchanges: z.number().int().min(1).max(20), historyDays: z.number().int().min(30).max(730), autoTasks: z.boolean() }),
  social: z.object({ requireApproval: z.boolean(), approverTier: z.enum(["OWNER", "LEADERSHIP"]) }),
  portal: z.object({ selfSignup: z.boolean(), autoApproveMatchingDomain: z.boolean(), welcomeMessage: str(500) }),
} as const;

export type SettingsGroup = keyof typeof SCHEMAS;

export async function saveSettingsGroup(key: SettingsGroup, value: unknown): Promise<Result> {
  try {
    const user = await actionCan("settings.manage");
    const schema = SCHEMAS[key];
    if (!schema) return { ok: false, error: "Unknown settings group." };
    const parsed = schema.parse(value);
    const before = await getSetting(key);
    await setSetting(key, parsed as Partial<SettingsMap[typeof key]>, user.id);
    await audit({ actorId: user.id, action: "settings_update", entityType: "Setting", entityId: key, before, after: parsed });
    revalidatePath("/hq/settings");
    revalidatePath("/hq", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const stageSchema = z.array(z.object({ key: z.string().min(1), label: z.string().min(1, "Every stage needs a label.").max(60), probability: int(0, 100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colors are hex like #149CA0").or(z.literal("")), sortOrder: int(0, 10000) }));

export async function savePipelineStages(stages: z.input<typeof stageSchema>): Promise<Result> {
  try {
    const user = await actionCan("settings.manage");
    const d = stageSchema.parse(stages);
    const before = await prisma.pipelineStage.findMany({ orderBy: { sortOrder: "asc" } });
    await prisma.$transaction(d.map((s) => prisma.pipelineStage.update({ where: { key: s.key }, data: { label: s.label, probability: s.probability, color: s.color || null, sortOrder: s.sortOrder } })));
    await audit({ actorId: user.id, action: "settings_update", entityType: "PipelineStage", before: before.map((s) => ({ key: s.key, label: s.label, probability: s.probability, color: s.color, sortOrder: s.sortOrder })), after: d });
    revalidatePath("/hq/settings");
    revalidatePath("/hq/deals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const departmentSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().min(2, "Give the department a name.").max(60),
  description: z.string().max(300).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colors are hex like #149CA0"),
  leadId: z.string().optional().nullable(),
});
export type DepartmentInput = z.input<typeof departmentSchema>;

export async function saveDepartment(input: DepartmentInput): Promise<Result<{ id: string }>> {
  try {
    const user = await actionCan("settings.manage");
    const d = departmentSchema.parse(input);
    if (d.id) {
      const before = await prisma.department.findUnique({ where: { id: d.id } });
      if (!before) return { ok: false, error: "Department not found." };
      await prisma.department.update({ where: { id: d.id }, data: { name: d.name, description: d.description || null, color: d.color, leadId: d.leadId || null } });
      await audit({ actorId: user.id, action: "update", entityType: "Department", entityId: d.id, before: { name: before.name, description: before.description, color: before.color, leadId: before.leadId }, after: { name: d.name, description: d.description ?? null, color: d.color, leadId: d.leadId ?? null } });
      revalidatePath("/hq/settings");
      return { ok: true, data: { id: d.id } };
    }
    let slug = slugify(d.name) || "department";
    if (await prisma.department.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
    const max = await prisma.department.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.department.create({ data: { slug, name: d.name, description: d.description || null, color: d.color, leadId: d.leadId || null, sortOrder: (max._max.sortOrder ?? 0) + 10 } });
    await audit({ actorId: user.id, action: "create", entityType: "Department", entityId: row.id, after: { name: d.name, slug } });
    revalidatePath("/hq/settings");
    revalidatePath("/hq/team");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}
