"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { logActivity, notify } from "@/lib/audit";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

const taskSchema = z.object({
  title: z.string().min(1, "Give the task a title.").max(200),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "DONE", "CANCELLED"]).default("TODO"),
  taskType: z.string().max(40).default("general"),
  dueAt: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  companyId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  ticketId: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  sopId: z.string().optional().nullable(),
  checklist: z.array(z.object({ text: z.string(), done: z.boolean() })).optional(),
  tags: z.array(z.string()).optional(),
});

export type TaskInput = z.input<typeof taskSchema>;

export async function saveTask(input: TaskInput & { id?: string }): Promise<Result<{ id: string }>> {
  try {
    const user = await actionStaff();
    const d = taskSchema.parse(input);
    const data = {
      title: d.title,
      description: d.description ?? null,
      priority: d.priority as TaskPriority,
      status: d.status as TaskStatus,
      taskType: d.taskType,
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
      assigneeId: d.assigneeId || user.id,
      contactId: d.contactId || null,
      companyId: d.companyId || null,
      dealId: d.dealId || null,
      projectId: d.projectId || null,
      ticketId: d.ticketId || null,
      siteId: d.siteId || null,
      sopId: d.sopId || null,
      checklist: d.checklist ?? undefined,
      tags: d.tags ?? [],
    };
    let id = input.id;
    if (id) {
      await prisma.task.update({ where: { id }, data });
    } else {
      const row = await prisma.task.create({ data: { ...data, createdById: user.id } });
      id = row.id;
      if (data.assigneeId && data.assigneeId !== user.id) await notify({ userId: data.assigneeId, type: "task", title: `New task from ${user.name}`, body: d.title, link: `/hq/tasks?open=${id}` });
    }
    revalidatePath("/hq");
    revalidatePath("/hq/tasks");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Result> {
  try {
    const user = await actionStaff();
    const task = await prisma.task.update({ where: { id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
    if (status === "DONE") {
      await logActivity({ type: "TASK_DONE", subject: task.title, contactId: task.contactId, companyId: task.companyId, dealId: task.dealId, ticketId: task.ticketId, siteId: task.siteId, actorId: user.id });
    }
    revalidatePath("/hq");
    revalidatePath("/hq/tasks");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTask(id: string): Promise<Result> {
  try {
    await actionStaff();
    await prisma.task.delete({ where: { id } });
    revalidatePath("/hq/tasks");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleChecklistItem(id: string, index: number, done: boolean): Promise<Result> {
  try {
    await actionStaff();
    const t = await prisma.task.findUnique({ where: { id }, select: { checklist: true } });
    const list = ((t?.checklist as { text: string; done: boolean }[] | null) ?? []).map((c, i) => (i === index ? { ...c, done } : c));
    await prisma.task.update({ where: { id }, data: { checklist: list } });
    revalidatePath("/hq/tasks");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
