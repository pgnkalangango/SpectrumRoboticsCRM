"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionCan, actionStaff, AccessDenied } from "@/lib/session";
import { audit, notify } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import type { SopScope, SopStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { parseQuiz } from "@/components/hq/sops/constants";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const opt = (max = 200) => z.string().max(max).optional().nullable().transform((v) => (v ? v : null));

const stepSchema = z.object({ title: z.string().min(1, "Every step needs a title.").max(200), detail: z.string().max(2000).optional().nullable(), required: z.boolean().optional() });
const quizSchema = z.object({
  question: z.string().min(1, "Every quiz question needs text.").max(400),
  options: z.array(z.string().min(1, "Quiz options cannot be empty.").max(300)).min(2, "Give at least two options.").max(4, "At most four options."),
  answerIndex: z.number().int().min(0),
});

const sopSchema = z.object({
  title: z.string().min(3, "Give the SOP a title.").max(200),
  code: opt(30).transform((v) => (v ? v.toUpperCase() : null)),
  departmentId: opt(),
  category: z.enum(["policy", "procedure", "checklist", "playbook", "reference", "onboarding", "best_practice"]).default("procedure"),
  scope: z.enum(["COMPANY", "DEPARTMENT"]).default("DEPARTMENT"),
  summary: z.string().max(600).optional().nullable(),
  body: z.string().max(200000).default(""),
  steps: z.array(stepSchema).default([]),
  keywords: z.array(z.string().max(60)).default([]),
  tags: z.array(z.string().max(60)).default([]),
  appliesTo: z.array(z.string().max(60)).default([]),
  requiresAcknowledgment: z.boolean().default(false),
  enforcedBySystem: opt(400),
  reviewDate: opt(20),
  quiz: z.array(quizSchema).default([]),
  changeNote: opt(300),
});
export type SopInput = z.input<typeof sopSchema>;

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  const root = slugify(base) || "sop";
  let slug = root;
  for (let i = 2; i < 50; i++) {
    const dup = await prisma.sop.findUnique({ where: { slug }, select: { id: true } });
    if (!dup || dup.id === ignoreId) return slug;
    slug = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

function cleanList(v: string[]): string[] {
  return Array.from(new Set(v.map((s) => s.trim()).filter(Boolean)));
}

export async function saveSop(input: SopInput & { id?: string }): Promise<Result<{ id: string; slug: string; version: number }>> {
  try {
    const user = await actionCan("sops.edit");
    const d = sopSchema.parse(input);
    for (const q of d.quiz) if (q.answerIndex >= q.options.length) return { ok: false, error: `Pick a correct answer for "${q.question}".` };
    if (d.code) {
      const dup = await prisma.sop.findFirst({ where: { code: d.code, ...(input.id ? { id: { not: input.id } } : {}) }, select: { title: true } });
      if (dup) return { ok: false, error: `Code ${d.code} is already used by "${dup.title}".` };
    }
    const data = {
      title: d.title,
      code: d.code,
      departmentId: d.departmentId,
      category: d.category,
      scope: d.scope as SopScope,
      summary: d.summary?.trim() || null,
      body: d.body,
      steps: d.steps.map((s) => ({ title: s.title.trim(), detail: s.detail?.trim() || "", required: s.required ?? true })),
      keywords: cleanList(d.keywords.map((k) => k.toLowerCase())),
      tags: cleanList(d.tags),
      appliesTo: cleanList(d.appliesTo),
      requiresAcknowledgment: d.requiresAcknowledgment,
      enforcedBySystem: d.enforcedBySystem,
      reviewDate: d.reviewDate ? new Date(d.reviewDate) : null,
      quiz: d.quiz.length ? d.quiz.map((q) => ({ question: q.question.trim(), options: q.options.map((o) => o.trim()), answerIndex: q.answerIndex })) : Prisma.DbNull,
    };

    if (input.id) {
      const before = await prisma.sop.findUnique({ where: { id: input.id } });
      if (!before) return { ok: false, error: "This SOP no longer exists." };
      const contentChanged = before.body !== data.body || JSON.stringify(before.steps ?? []) !== JSON.stringify(data.steps);
      const bump = before.status === "PUBLISHED" && contentChanged;
      const version = bump ? before.version + 1 : before.version;
      const row = await prisma.sop.update({ where: { id: input.id }, data: { ...data, version } });
      if (bump) {
        await prisma.sopVersion.create({ data: { sopId: row.id, version, title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: d.changeNote ?? "Updated", changedById: user.id } });
      } else if (before.status !== "PUBLISHED" && contentChanged) {
        // Drafts keep one working version row so history always has the latest text.
        await prisma.sopVersion.upsert({ where: { sopId_version: { sopId: row.id, version } }, create: { sopId: row.id, version, title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: d.changeNote ?? "Draft saved", changedById: user.id }, update: { title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: d.changeNote ?? "Draft saved", changedById: user.id } });
      }
      await audit({ actorId: user.id, action: bump ? "sop_new_version" : "update", entityType: "Sop", entityId: row.id, before: { version: before.version, title: before.title, requiresAcknowledgment: before.requiresAcknowledgment }, after: { version, title: row.title, requiresAcknowledgment: row.requiresAcknowledgment, changeNote: d.changeNote ?? null } });
      revalidatePath("/hq/sops");
      revalidatePath(`/hq/sops/${row.slug}`);
      return { ok: true, data: { id: row.id, slug: row.slug, version } };
    }

    const slug = await uniqueSlug(d.title);
    const row = await prisma.sop.create({ data: { ...data, slug, ownerId: user.id, status: "DRAFT", version: 1, source: "written in HQ" } });
    await prisma.sopVersion.create({ data: { sopId: row.id, version: 1, title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: "Created", changedById: user.id } });
    await audit({ actorId: user.id, action: "create", entityType: "Sop", entityId: row.id, after: { title: row.title, slug } });
    revalidatePath("/hq/sops");
    return { ok: true, data: { id: row.id, slug, version: 1 } };
  } catch (e) {
    return fail(e);
  }
}

export async function publishSop(id: string): Promise<Result<{ slug: string }>> {
  try {
    const user = await actionCan("sops.edit");
    const sop = await prisma.sop.findUnique({ where: { id }, include: { department: { select: { name: true } } } });
    if (!sop) return { ok: false, error: "This SOP no longer exists." };
    if (!sop.body.trim() && !Array.isArray(sop.steps)) return { ok: false, error: "Write the body or add steps before publishing." };
    const row = await prisma.sop.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: sop.publishedAt ?? new Date() } });
    await prisma.sopVersion.upsert({ where: { sopId_version: { sopId: id, version: row.version } }, create: { sopId: id, version: row.version, title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: "Published", changedById: user.id }, update: {} });
    await audit({ actorId: user.id, action: "publish", entityType: "Sop", entityId: id, before: { status: sop.status }, after: { status: "PUBLISHED", version: row.version } });
    if (row.requiresAcknowledgment) {
      const audience = await prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", id: { not: user.id }, ...(row.scope === "DEPARTMENT" && row.departmentId ? { departmentId: row.departmentId } : {}) }, select: { id: true } });
      await Promise.all(audience.map((u) => notify({ userId: u.id, type: "system", title: `Please read and acknowledge: ${row.title}`, body: sop.status === "PUBLISHED" ? `Version ${row.version} was published.` : `A new ${row.category.replace(/_/g, " ")} for ${sop.department?.name ?? "everyone"}.`, link: `/hq/sops/${row.slug}` })));
    }
    revalidatePath("/hq/sops");
    revalidatePath(`/hq/sops/${row.slug}`);
    revalidatePath("/hq", "layout");
    return { ok: true, data: { slug: row.slug } };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveSop(id: string): Promise<Result> {
  try {
    const user = await actionCan("sops.edit");
    const before = await prisma.sop.findUnique({ where: { id }, select: { status: true, slug: true } });
    if (!before) return { ok: false, error: "This SOP no longer exists." };
    await prisma.sop.update({ where: { id }, data: { status: "ARCHIVED" } });
    await audit({ actorId: user.id, action: "archive", entityType: "Sop", entityId: id, before: { status: before.status }, after: { status: "ARCHIVED" } });
    revalidatePath("/hq/sops");
    revalidatePath(`/hq/sops/${before.slug}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function unarchiveSop(id: string): Promise<Result> {
  try {
    const user = await actionCan("sops.edit");
    const before = await prisma.sop.findUnique({ where: { id }, select: { status: true, slug: true } });
    if (!before) return { ok: false, error: "This SOP no longer exists." };
    await prisma.sop.update({ where: { id }, data: { status: "DRAFT" as SopStatus } });
    await audit({ actorId: user.id, action: "unarchive", entityType: "Sop", entityId: id, before: { status: before.status }, after: { status: "DRAFT" } });
    revalidatePath("/hq/sops");
    revalidatePath(`/hq/sops/${before.slug}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function duplicateSop(id: string): Promise<Result<{ id: string; slug: string }>> {
  try {
    const user = await actionCan("sops.edit");
    const src = await prisma.sop.findUnique({ where: { id } });
    if (!src) return { ok: false, error: "This SOP no longer exists." };
    const title = `Copy of ${src.title}`;
    const slug = await uniqueSlug(title);
    const row = await prisma.sop.create({
      data: {
        slug,
        title,
        code: null,
        summary: src.summary,
        body: src.body,
        steps: src.steps ?? undefined,
        category: src.category,
        scope: src.scope,
        departmentId: src.departmentId,
        ownerId: user.id,
        status: "DRAFT",
        version: 1,
        keywords: src.keywords,
        tags: src.tags,
        appliesTo: src.appliesTo,
        requiresAcknowledgment: src.requiresAcknowledgment,
        enforcedBySystem: src.enforcedBySystem,
        reviewDate: src.reviewDate,
        quiz: src.quiz ?? undefined,
        source: `duplicated from ${src.code ?? src.slug}`,
      },
    });
    await prisma.sopVersion.create({ data: { sopId: row.id, version: 1, title: row.title, body: row.body, steps: row.steps ?? undefined, changeNote: `Duplicated from ${src.title}`, changedById: user.id } });
    await audit({ actorId: user.id, action: "duplicate", entityType: "Sop", entityId: row.id, after: { from: src.id, slug } });
    revalidatePath("/hq/sops");
    return { ok: true, data: { id: row.id, slug } };
  } catch (e) {
    return fail(e);
  }
}

// Employees confirm they have read the current version. When a quiz exists the answers are graded here.
export async function acknowledgeSop(sopId: string, version: number, quizScore?: number | null, answers?: number[]): Promise<Result<{ score: number | null; wrong: number[] }>> {
  try {
    const user = await actionStaff();
    const sop = await prisma.sop.findUnique({ where: { id: sopId }, select: { version: true, status: true, quiz: true, title: true, slug: true } });
    if (!sop || sop.status !== "PUBLISHED") return { ok: false, error: "This SOP is not published." };
    if (sop.version !== version) return { ok: false, error: "A newer version was published. Reload the page and read it again." };
    const quiz = parseQuiz(sop.quiz);
    let score: number | null = null;
    const wrong: number[] = [];
    if (quiz.length) {
      if (!answers || answers.length !== quiz.length) return { ok: false, error: "Answer every quiz question first." };
      quiz.forEach((q, i) => {
        if (answers[i] !== q.answerIndex) wrong.push(i);
      });
      score = Math.round(((quiz.length - wrong.length) / quiz.length) * 100);
      if (score < 100) return { ok: true, data: { score, wrong } };
    } else if (typeof quizScore === "number") {
      score = quizScore;
    }
    await prisma.sopAcknowledgment.upsert({ where: { sopId_userId_version: { sopId, userId: user.id, version } }, create: { sopId, userId: user.id, version, quizScore: score }, update: { quizScore: score, acknowledgedAt: new Date() } });
    await audit({ actorId: user.id, action: "sop_acknowledged", entityType: "Sop", entityId: sopId, after: { version, quizScore: score } });
    revalidatePath(`/hq/sops/${sop.slug}`);
    revalidatePath("/hq/sops");
    return { ok: true, data: { score, wrong: [] } };
  } catch (e) {
    return fail(e);
  }
}
