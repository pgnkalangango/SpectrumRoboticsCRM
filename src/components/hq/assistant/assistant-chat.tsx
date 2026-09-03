"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Sparkles, Plus, Send, Trash2, Wrench, MessageSquare, Copy, Check, BookmarkPlus, X, Mail, UserRound, ChevronRight } from "lucide-react";
import { cn, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { askAssistant, deletePrompt, deleteThread, savePrompt } from "@/server/actions/assistant";

type Thread = { id: string; title: string; lastMessageAt: string; contextType: string };
type Prompt = { id: string; title: string; prompt: string; scope: string; mine: boolean };
type Msg = { id: string; role: "user" | "assistant"; content: string; trace: { tool: string; summary: string; ok: boolean; ms: number }[]; createdAt: string; pending?: boolean };

export function AssistantChat({ threads, prompts, initialThreadId, initialMessages, context, prefill, configured, mailboxConnected, hasVoice, firstName, tier }: { threads: Thread[]; prompts: Prompt[]; initialThreadId: string | null; initialMessages: Msg[]; context: { type: string; id: string; label: string } | null; prefill: string | null; configured: boolean; mailboxConnected: boolean; hasVoice: boolean; firstName: string; tier: string }) {
  const router = useRouter();
  const [threadId, setThreadId] = React.useState<string | null>(initialThreadId);
  const [messages, setMessages] = React.useState<Msg[]>(initialMessages);
  const [input, setInput] = React.useState(prefill ?? "");
  const [busy, setBusy] = React.useState(false);
  const [promptOpen, setPromptOpen] = React.useState(false);
  const bottom = React.useRef<HTMLDivElement>(null);
  const autoSent = React.useRef(false);

  React.useEffect(() => {
    setThreadId(initialThreadId);
    setMessages(initialMessages);
  }, [initialThreadId, initialMessages]);
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  React.useEffect(() => {
    if (prefill && !autoSent.current && configured) {
      autoSent.current = true;
      void ask(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, configured]);

  async function ask(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const tempUser: Msg = { id: `u-${Date.now()}`, role: "user", content: q, trace: [], createdAt: new Date().toISOString() };
    const tempBot: Msg = { id: `a-${Date.now()}`, role: "assistant", content: "", trace: [], createdAt: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, tempUser, tempBot]);
    const r = await askAssistant({ threadId, message: q, context });
    setBusy(false);
    if (r.ok && r.data) {
      const { threadId: tid, answer, trace, messageId } = r.data;
      setMessages((m) => m.map((x) => (x.id === tempBot.id ? { id: messageId, role: "assistant", content: answer, trace, createdAt: new Date().toISOString() } : x)));
      if (!threadId) {
        setThreadId(tid);
        router.replace(`/hq/assistant?thread=${tid}`, { scroll: false });
      }
      router.refresh();
    } else if (!r.ok) {
      setMessages((m) => m.map((x) => (x.id === tempBot.id ? { ...x, content: r.error, pending: false } : x)));
      toast.error(r.error);
    }
  }

  const newConversation = () => {
    setThreadId(null);
    setMessages([]);
    setInput("");
    router.replace("/hq/assistant", { scroll: false });
  };

  const grouped = { company: prompts.filter((p) => p.scope === "company"), department: prompts.filter((p) => p.scope === "department"), personal: prompts.filter((p) => p.scope === "personal") };

  return (
    <div className="flex h-[calc(100vh-7.5rem)] gap-4">
      <aside className="hidden w-64 shrink-0 flex-col rounded-xl border border-line bg-surface shadow-sm md:flex">
        <div className="border-b border-line p-2">
          <Button size="sm" className="w-full" onClick={newConversation}>
            <Plus /> New conversation
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="p-3 text-xs text-muted">Your conversations stay private to you.</p>
          ) : (
            <ul className="divide-y divide-line">
              {threads.map((t) => (
                <li key={t.id} className={cn("group flex items-center gap-1.5 px-2 py-2 text-sm hover:bg-surface-2", t.id === threadId && "bg-brand-tint/40")}>
                  <Link href={`/hq/assistant?thread=${t.id}`} className="flex min-w-0 flex-1 items-center gap-1.5">
                    <MessageSquare className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">{t.title}</span>
                  </Link>
                  <span className="text-[10px] text-faint">{relTime(t.lastMessageAt)}</span>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-bad"
                    aria-label="Delete conversation"
                    onClick={async () => {
                      await deleteThread(t.id);
                      if (t.id === threadId) newConversation();
                      else router.refresh();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-line bg-ground">
        <div className="flex items-center gap-2 rounded-t-xl border-b border-line bg-surface px-4 py-3">
          <Sparkles className="size-5 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="font-display font-semibold leading-tight">Assistant</div>
            <div className="truncate text-xs text-muted">Knows the CRM, the SOP library, and your own email and calendar. Drafts in your voice. Never sends.</div>
          </div>
          {context ? (
            <Link href={`/hq/${context.type === "company" ? "companies" : context.type === "contact" ? "contacts" : context.type + "s"}/${context.id}`} className="flex items-center gap-1 rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-medium text-brand-deep dark:text-brand-bright">
              About: {context.label || context.type} <ChevronRight className="size-3" />
            </Link>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!configured ? (
            <div className="mx-auto mt-10 max-w-lg rounded-xl border border-warn/40 bg-warn-soft p-5 text-sm text-warn">
              <div className="mb-1 font-semibold">The assistant is not switched on yet</div>
              {tier === "OWNER" ? "Add ANTHROPIC_API_KEY to the server environment, then reload. The Integrations page shows what is set." : "An owner needs to finish the setup under Integrations."}
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto mt-6 max-w-2xl">
              <div className="text-center">
                <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand-deep dark:text-brand-bright">
                  <Sparkles className="size-5" />
                </div>
                <h2 className="font-display text-xl font-bold">What can I help with, {firstName}?</h2>
                <p className="mt-1 text-sm text-muted">Ask in plain language. I look things up before answering and show you what I checked.</p>
                {!mailboxConnected ? (
                  <p className="mt-2 text-xs text-muted">
                    <Mail className="mr-1 inline size-3.5" />
                    <Link href="/hq/inbox" className="text-brand hover:underline">Connect your mailbox</Link> to ask about your email and calendar.
                  </p>
                ) : null}
                {!hasVoice ? (
                  <p className="mt-1 text-xs text-muted">
                    <UserRound className="mr-1 inline size-3.5" />
                    <Link href="/hq/me" className="text-brand hover:underline">Add your writing voice</Link> so drafts sound like you.
                  </p>
                ) : null}
              </div>
              {(["company", "department", "personal"] as const).map((scope) =>
                grouped[scope].length ? (
                  <div key={scope} className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="eyebrow">{scope === "company" ? "Everyone uses these" : scope === "department" ? "For your department" : "Your saved prompts"}</div>
                      {scope === "personal" ? (
                        <button className="text-xs text-brand hover:underline" onClick={() => setPromptOpen(true)}>
                          Add
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {grouped[scope].map((p) => (
                        <div key={p.id} className="group relative">
                          <button onClick={() => ask(p.prompt)} className="w-full rounded-lg border border-line bg-surface p-3 text-left text-sm shadow-sm hover:border-brand">
                            <div className="font-medium">{p.title}</div>
                            <div className="mt-0.5 line-clamp-2 text-xs text-muted">{p.prompt}</div>
                          </button>
                          {p.mine || tier !== "EMPLOYEE" ? (
                            <button className="absolute right-2 top-2 hidden text-faint hover:text-bad group-hover:block" aria-label="Remove prompt" onClick={() => deletePrompt(p.id).then(() => router.refresh())}>
                              <X className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
              {grouped.personal.length === 0 ? (
                <button onClick={() => setPromptOpen(true)} className="mt-4 flex items-center gap-1 text-xs text-brand hover:underline">
                  <BookmarkPlus className="size-3.5" /> Save a prompt you use often
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
              <div ref={bottom} />
            </div>
          )}
        </div>

        <form
          className="flex items-end gap-2 rounded-b-xl border-t border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <Textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!configured}
            placeholder="Ask about a customer, your pipeline, your email, or how to do something"
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <Tooltip content="Save this as a prompt">
            <Button type="button" variant="ghost" size="icon" disabled={!input.trim()} onClick={() => setPromptOpen(true)} aria-label="Save prompt">
              <BookmarkPlus />
            </Button>
          </Tooltip>
          <Button type="submit" disabled={busy || !input.trim() || !configured} loading={busy} aria-label="Send">
            <Send />
          </Button>
        </form>
      </div>
      <SavePromptDialog open={promptOpen} onOpenChange={setPromptOpen} initialPrompt={input} canShare={tier !== "EMPLOYEE"} />
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const isUser = m.role === "user";
  const parts = React.useMemo(() => m.content.split(/```/), [m.content]);
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed shadow-sm", isUser ? "bg-ink text-white dark:bg-surface-3 dark:text-ink" : "border border-line bg-surface")}>
        {m.pending ? (
          <span className="flex items-center gap-2 text-muted">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" /> Working on it…
          </span>
        ) : isUser ? (
          <span className="whitespace-pre-wrap">{m.content}</span>
        ) : (
          parts.map((p, i) =>
            i % 2 === 1 ? (
              <CodeBlock key={i} text={p.replace(/^[a-z]*\n/, "")} />
            ) : (
              <div key={i} className="prose-sm [&_a]:text-brand [&_a]:underline [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-bold [&_h2]:mt-3 [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border-b [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{p}</ReactMarkdown>
              </div>
            ),
          )
        )}
        {m.trace?.length ? (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2 text-[11px] text-muted">
            {m.trace.map((t, i) => (
              <span key={i} className={cn("inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5", !t.ok && "text-bad")} title={`${t.summary} · ${t.ms} ms`}>
                <Wrench className="size-3" /> {t.tool.replace(/^mcp_/, "").replace(/_/g, " ")}
                {t.summary ? <span className="text-faint">· {t.summary.slice(0, 40)}</span> : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="relative my-2">
      <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-[13px] leading-relaxed">{text}</pre>
      <button
        className="absolute right-2 top-2 flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted shadow-sm hover:text-ink"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function SavePromptDialog({ open, onOpenChange, initialPrompt, canShare }: { open: boolean; onOpenChange: (o: boolean) => void; initialPrompt: string; canShare: boolean }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [prompt, setPrompt] = React.useState(initialPrompt);
  const [scope, setScope] = React.useState<"personal" | "department" | "company">("personal");
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    if (open) setPrompt(initialPrompt);
  }, [open, initialPrompt]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Save a prompt</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <Field label="Name">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly pipeline check" autoFocus />
          </Field>
          <Field label="Prompt">
            <Textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Field>
          {canShare ? (
            <Field label="Who can use it">
              <div className="flex gap-2 text-sm">
                {(["personal", "department", "company"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-1.5">
                    <input type="radio" checked={scope === s} onChange={() => setScope(s)} /> {s === "personal" ? "Just me" : s === "department" ? "My department" : "Everyone"}
                  </label>
                ))}
              </div>
            </Field>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabled={!title.trim() || !prompt.trim()}
            onClick={() =>
              start(async () => {
                const r = await savePrompt({ title, prompt, scope });
                if (r.ok) {
                  toast.success("Prompt saved");
                  onOpenChange(false);
                  setTitle("");
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
