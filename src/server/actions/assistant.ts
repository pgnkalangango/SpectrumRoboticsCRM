"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { actionStaff, AccessDenied } from "@/lib/session";
import { runAssistant, friendlyAssistantError, type TraceEntry } from "@/lib/ai/run";
import { fullName } from "@/lib/utils";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
function fail(e: unknown): Result<never> {
  if (e instanceof AccessDenied) return { ok: false, error: e.message };
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
  return { ok: false, error: friendlyAssistantError(e) };
}

const askSchema = z.object({
  threadId: z.string().optional().nullable(),
  message: z.string().min(1).max(20000),
  context: z.object({ type: z.string(), id: z.string(), label: z.string().optional() }).optional().nullable(),
});

export async function askAssistant(input: z.input<typeof askSchema>): Promise<Result<{ threadId: string; answer: string; trace: TraceEntry[]; messageId: string }>> {
  try {
    const user = await actionStaff();
    const d = askSchema.parse(input);
    let thread = d.threadId ? await prisma.assistantThread.findFirst({ where: { id: d.threadId, userId: user.id } }) : null;
    if (!thread) {
      thread = await prisma.assistantThread.create({ data: { userId: user.id, title: d.message.slice(0, 70), contextType: d.context?.type ?? "general", contextId: d.context?.id ?? null } });
    }
    const history = await prisma.assistantMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" }, take: 40, select: { role: true, content: true } });
    await prisma.assistantMessage.create({ data: { threadId: thread.id, role: "user", content: d.message } });
    const contextNote = d.context ? `(Context: the user opened this from the ${d.context.type} record ${d.context.label ? `"${d.context.label}" ` : ""}with id ${d.context.id}. Use get_record on it when relevant.)` : undefined;
    const result = await runAssistant({ userId: user.id, messages: [...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user", content: d.message }], contextNote });
    const saved = await prisma.assistantMessage.create({ data: { threadId: thread.id, role: "assistant", content: result.answer, toolCalls: result.trace, model: result.model, tokensIn: result.usage.input, tokensOut: result.usage.output } });
    await prisma.assistantThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
    revalidatePath("/hq/assistant");
    return { ok: true, data: { threadId: thread.id, answer: result.answer, trace: result.trace, messageId: saved.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteThread(id: string): Promise<Result> {
  try {
    const user = await actionStaff();
    await prisma.assistantThread.deleteMany({ where: { id, userId: user.id } });
    revalidatePath("/hq/assistant");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function renameThread(id: string, title: string): Promise<Result> {
  try {
    const user = await actionStaff();
    await prisma.assistantThread.updateMany({ where: { id, userId: user.id }, data: { title: title.slice(0, 120) } });
    revalidatePath("/hq/assistant");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function savePrompt(input: { id?: string; title: string; prompt: string; scope?: "personal" | "department" | "company" }): Promise<Result> {
  try {
    const user = await actionStaff();
    const scope = input.scope ?? "personal";
    if (scope !== "personal" && user.tier === "EMPLOYEE") return { ok: false, error: "Only leadership can add shared prompts." };
    const dept = scope === "department" ? (await prisma.user.findUnique({ where: { id: user.id }, select: { department: { select: { name: true } } } }))?.department?.name ?? null : null;
    if (input.id) await prisma.savedPrompt.update({ where: { id: input.id }, data: { title: input.title.slice(0, 120), prompt: input.prompt.slice(0, 4000) } });
    else await prisma.savedPrompt.create({ data: { title: input.title.slice(0, 120), prompt: input.prompt.slice(0, 4000), scope, department: dept, userId: scope === "personal" ? user.id : null } });
    revalidatePath("/hq/assistant");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePrompt(id: string): Promise<Result> {
  try {
    const user = await actionStaff();
    const p = await prisma.savedPrompt.findUnique({ where: { id } });
    if (!p) return { ok: true };
    if (p.scope === "personal" && p.userId !== user.id) return { ok: false, error: "Not yours to delete." };
    if (p.scope !== "personal" && user.tier === "EMPLOYEE") return { ok: false, error: "Only leadership can remove shared prompts." };
    await prisma.savedPrompt.delete({ where: { id } });
    revalidatePath("/hq/assistant");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Used by the Inbox reply composer. Pulls CRM context for the contact and drafts in the user's voice.
export async function draftReply(input: { threadId?: string | null; contactId?: string | null; toEmail: string; subject: string; thread: { from: string; direction: string; at: string; text: string }[]; instruction?: string }): Promise<Result<{ draft: string }>> {
  try {
    const user = await actionStaff();
    const contact = input.contactId ? await prisma.contact.findUnique({ where: { id: input.contactId }, include: { company: { select: { name: true } }, deals: { include: { deal: { include: { stage: true } } } } } }) : await prisma.contact.findFirst({ where: { OR: [{ email: input.toEmail.toLowerCase() }, { emailSecondary: input.toEmail.toLowerCase() }] }, include: { company: { select: { name: true } }, deals: { include: { deal: { include: { stage: true } } } } } });
    if (contact?.doNotContact) return { ok: false, error: `${fullName(contact)} asked not to be contacted. No draft was written.` };
    const crm = contact ? `CRM context: ${fullName(contact)}${contact.jobTitle ? `, ${contact.jobTitle}` : ""}${contact.company ? ` at ${contact.company.name}` : ""}. Type: ${contact.type}. ${contact.deals.length ? `Deals: ${contact.deals.map((d) => `${d.deal.name} (${d.deal.stage.label}${d.deal.nextStep ? `, next: ${d.deal.nextStep}` : ""})`).join("; ")}.` : "No open deals."}${contact.notes ? ` Notes: ${contact.notes.slice(0, 500)}` : ""}` : "CRM context: this sender is not a contact yet.";
    const threadText = input.thread.map((m) => `[${m.direction === "OUTBOUND" ? "me" : m.from} on ${new Date(m.at).toLocaleString("en-US")}]\n${m.text}`).join("\n\n---\n\n");
    const message = `Draft my reply to this email thread. Subject: ${input.subject}. To: ${input.toEmail}.\n${crm}\n${input.instruction ? `Instruction: ${input.instruction}\n` : ""}\nThread (oldest first):\n\n${threadText.slice(0, 16000)}\n\nWrite only the reply body.`;
    const result = await runAssistant({ userId: user.id, messages: [{ role: "user", content: message }], mode: "draft_reply", scopes: ["read", "draft"], maxRounds: 4 });
    const draft = result.answer.replace(/^```[a-z]*\n?|```$/g, "").trim();
    return { ok: true, data: { draft } };
  } catch (e) {
    return fail(e);
  }
}
