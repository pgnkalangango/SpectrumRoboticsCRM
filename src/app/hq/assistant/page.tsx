import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { assistantConfigured } from "@/lib/ai/run";
import { getMailConnection } from "@/lib/mail/provider";
import { AssistantChat } from "@/components/hq/assistant/assistant-chat";

export const metadata = { title: "Assistant" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, voiceProfile: true, department: { select: { name: true } } } });
  const [threads, prompts, conn] = await Promise.all([
    prisma.assistantThread.findMany({ where: { userId: user.id, archived: false }, orderBy: { lastMessageAt: "desc" }, take: 60, select: { id: true, title: true, lastMessageAt: true, contextType: true } }),
    prisma.savedPrompt.findMany({ where: { OR: [{ scope: "company" }, { scope: "department", department: me?.department?.name ?? "__none" }, { scope: "personal", userId: user.id }] }, orderBy: [{ scope: "asc" }, { sortOrder: "asc" }] }),
    getMailConnection(user.id),
  ]);
  const activeId = sp.thread ?? null;
  const messages = activeId ? await prisma.assistantMessage.findMany({ where: { threadId: activeId, thread: { userId: user.id } }, orderBy: { createdAt: "asc" }, take: 200 }) : [];
  const context = sp.type && sp.id ? { type: sp.type, id: sp.id, label: sp.label ?? "" } : null;

  return (
    <AssistantChat
      threads={threads.map((t) => ({ id: t.id, title: t.title, lastMessageAt: t.lastMessageAt.toISOString(), contextType: t.contextType }))}
      prompts={prompts.map((p) => ({ id: p.id, title: p.title, prompt: p.prompt, scope: p.scope, mine: p.userId === user.id }))}
      initialThreadId={activeId}
      initialMessages={messages.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content, trace: (m.toolCalls as { tool: string; summary: string; ok: boolean; ms: number }[] | null) ?? [], createdAt: m.createdAt.toISOString() }))}
      context={context}
      prefill={sp.q ?? null}
      configured={assistantConfigured()}
      mailboxConnected={!!conn}
      hasVoice={!!me?.voiceProfile}
      firstName={(me?.name ?? user.name).split(" ")[0]}
      tier={user.tier}
    />
  );
}
