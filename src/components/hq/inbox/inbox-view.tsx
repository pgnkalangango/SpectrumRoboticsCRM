"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ExternalLink, Paperclip, RefreshCw, Reply, Search, Sparkles, UserPlus, Unplug, Inbox as InboxIcon, Clock, Send } from "lucide-react";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import type { MailStats } from "@/lib/mail/sync";
import type { CalendarEventDto, MailMessageDto } from "@/lib/mail/types";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { createContactFromSender, disconnectMailbox, getThreadMessages, markThreadRead, sendMailFromInbox, syncNow, upcomingEvents } from "@/server/actions/inbox";
import { draftReply } from "@/server/actions/assistant";

export type InboxThread = {
  threadId: string;
  subject: string;
  lastAt: string;
  lastDirection: "INBOUND" | "OUTBOUND";
  snippet: string;
  unread: boolean;
  count: number;
  counterpart: { email: string; name: string | null };
  contact: { id: string; name: string; company: string | null } | null;
  lastExternalId: string;
  hasAttachments: boolean;
};

type Filter = "all" | "unread" | "waiting" | "contacts";

export function InboxView({ threads, stats, connection, me, notice }: { threads: InboxThread[]; stats: MailStats; connection: { provider: string; email: string; lastSyncAt: string | null; status: string; lastError: string | null }; me: { id: string; name: string; email: string }; notice: string | null }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<MailMessageDto[] | null>(null);
  const [loadingThread, setLoadingThread] = React.useState(false);
  const [syncing, startSync] = React.useTransition();
  const [events, setEvents] = React.useState<CalendarEventDto[] | null>(null);
  const waitingIds = React.useMemo(() => new Set(stats.awaitingMyReply.map((a) => a.threadId)), [stats]);

  // Sync when the cache is stale (older than 10 minutes) and load the calendar strip.
  React.useEffect(() => {
    const stale = !connection.lastSyncAt || Date.now() - new Date(connection.lastSyncAt).getTime() > 10 * 60 * 1000;
    if (stale) startSync(async () => {
      const r = await syncNow(30);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
    upcomingEvents(7).then((r) => setEvents(r.ok && r.data ? r.data : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = threads.filter((t) => {
    if (filter === "unread" && !t.unread) return false;
    if (filter === "waiting" && !waitingIds.has(t.threadId)) return false;
    if (filter === "contacts" && !t.contact) return false;
    if (q) {
      const s = `${t.subject} ${t.counterpart.email} ${t.counterpart.name ?? ""} ${t.contact?.name ?? ""} ${t.snippet}`.toLowerCase();
      return s.includes(q.toLowerCase());
    }
    return true;
  });
  const current = threads.find((t) => t.threadId === selected) ?? null;

  const open = async (t: InboxThread) => {
    setSelected(t.threadId);
    setMessages(null);
    setLoadingThread(true);
    const r = await getThreadMessages(t.threadId);
    setLoadingThread(false);
    if (r.ok && r.data) setMessages(r.data);
    else toast.error(r.ok ? "Could not load the thread." : r.error);
    if (t.unread) markThreadRead(t.threadId).then(() => router.refresh());
  };

  return (
    <div className="flex flex-col gap-4">
      {notice ? <p className="rounded-lg bg-brand-tint px-3 py-2 text-sm text-brand-deep dark:text-brand-bright">{notice}</p> : null}
      {connection.lastError ? <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">Last sync problem: {connection.lastError}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Waiting on me" value={stats.awaitingMyReply.length} tone={stats.awaitingMyReply.length ? "warn" : "ok"} onClick={() => setFilter("waiting")} active={filter === "waiting"} />
        <StatTile label="Received, 30 days" value={stats.received} />
        <StatTile label="Sent, 30 days" value={stats.sent} />
        <StatTile label="Median reply time" value={stats.medianReplyHours === null ? "–" : `${stats.medianReplyHours} h`} />
        <StatTile label="People" value={stats.correspondents} />
      </div>

      {events && events.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {events.slice(0, 6).map((e) => (
            <a key={e.id} href={e.link ?? undefined} target="_blank" rel="noreferrer" className="flex min-w-[220px] shrink-0 items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs hover:border-brand">
              <CalendarDays className="mt-0.5 size-3.5 text-brand" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{e.title}</span>
                <span className="block text-muted">{e.allDay ? "All day" : fmtDateTime(e.start)}{e.attendees.length ? ` · ${e.attendees.length} people` : ""}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}

      <div className="grid min-h-[600px] gap-4 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col rounded-xl border border-line bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-line p-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail" className="h-8 pl-8" />
            </div>
            <Tooltip content="Sync now">
              <Button variant="ghost" size="icon-sm" loading={syncing} onClick={() => startSync(async () => { const r = await syncNow(30); if (r.ok) { toast.success(`Synced ${r.data?.synced ?? 0} messages`); router.refresh(); } else toast.error(r.error); })} aria-label="Sync now">
                <RefreshCw />
              </Button>
            </Tooltip>
            <Tooltip content="Disconnect mailbox">
              <Button variant="ghost" size="icon-sm" onClick={() => { if (confirm("Disconnect your mailbox from HQ? Cached messages are removed.")) disconnectMailbox().then(() => router.refresh()); }} aria-label="Disconnect">
                <Unplug />
              </Button>
            </Tooltip>
          </div>
          <div className="flex gap-1 border-b border-line px-2 py-1.5">
            {(["all", "unread", "waiting", "contacts"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-2 py-1 text-xs font-semibold capitalize", filter === f ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-muted hover:text-ink")}>
                {f === "waiting" ? "Waiting on me" : f === "contacts" ? "Known contacts" : f}
              </button>
            ))}
          </div>
          <ul className="max-h-[640px] flex-1 divide-y divide-line overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="p-6 text-center text-sm text-muted">{threads.length === 0 ? (syncing ? "Syncing your mailbox…" : "No messages yet. Press sync.") : "Nothing matches."}</li>
            ) : (
              filtered.map((t) => (
                <li key={t.threadId}>
                  <button onClick={() => open(t)} className={cn("flex w-full flex-col gap-0.5 px-3 py-2.5 text-left hover:bg-surface-2", selected === t.threadId && "bg-brand-tint/40")}>
                    <span className="flex items-center gap-2">
                      {t.unread ? <span className="size-1.5 shrink-0 rounded-full bg-brand" /> : null}
                      <span className={cn("min-w-0 flex-1 truncate text-[13px]", t.unread ? "font-bold text-ink" : "font-medium text-ink")}>{t.contact?.name ?? t.counterpart.name ?? t.counterpart.email}</span>
                      <span className="shrink-0 text-[11px] text-faint">{relTime(t.lastAt)}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
                      {t.lastDirection === "OUTBOUND" ? <ArrowUpRight className="size-3 text-brand" /> : <ArrowDownLeft className="size-3 text-ok" />}
                      <span className="truncate">{t.subject}</span>
                      {t.hasAttachments ? <Paperclip className="size-3 text-faint" /> : null}
                      {t.count > 1 ? <span className="ml-auto rounded bg-surface-2 px-1 text-[10px] text-muted">{t.count}</span> : null}
                    </span>
                    <span className="truncate text-xs text-muted">{t.snippet}</span>
                    {t.contact ? <span className="mt-0.5 text-[10.5px] text-brand">{t.contact.company ?? "Contact"}</span> : waitingIds.has(t.threadId) ? <span className="mt-0.5 text-[10.5px] text-warn">Waiting on you</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-line bg-surface shadow-sm">
          {!current ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center p-8 text-center text-muted">
              <InboxIcon className="mb-3 size-8 text-faint" />
              <p className="text-sm">Pick a conversation. Replies go out from {connection.email} with your signature.</p>
            </div>
          ) : (
            <ThreadPane thread={current} messages={messages} loading={loadingThread} me={me} onChanged={() => router.refresh()} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, tone = "default", onClick, active }: { label: string; value: React.ReactNode; tone?: "default" | "warn" | "ok"; onClick?: () => void; active?: boolean }) {
  const tones = { default: "text-ink", warn: "text-warn", ok: "text-ok" };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick} className={cn("rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-sm", onClick && "hover:border-brand", active && "border-brand")}>
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1 font-display text-xl font-bold tabular", tones[tone])}>{value}</div>
    </Comp>
  );
}

function ThreadPane({ thread, messages, loading, me, onChanged }: { thread: InboxThread; messages: MailMessageDto[] | null; loading: boolean; me: { id: string; name: string; email: string }; onChanged: () => void }) {
  const router = useRouter();
  const [replying, setReplying] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [sending, startSend] = React.useTransition();
  const [drafting, startDraft] = React.useTransition();
  const [creating, startCreate] = React.useTransition();
  const last = messages?.[messages.length - 1] ?? null;
  const lastInbound = [...(messages ?? [])].reverse().find((m) => m.direction === "INBOUND") ?? last;
  const replyTo = lastInbound?.from?.email && lastInbound.from.email !== me.email ? lastInbound.from.email : thread.counterpart.email;
  const subject = thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`;

  React.useEffect(() => {
    setReplying(false);
    setBody("");
  }, [thread.threadId]);

  const send = () =>
    startSend(async () => {
      const r = await sendMailFromInbox({ to: [replyTo], subject, body, replyToExternalId: lastInbound?.id ?? thread.lastExternalId, threadId: thread.threadId, contactId: thread.contact?.id ?? null });
      if (r.ok) {
        toast.success("Sent");
        setBody("");
        setReplying(false);
        onChanged();
      } else toast.error(r.error);
    });

  const draft = () =>
    startDraft(async () => {
      const r = await draftReply({ threadId: thread.threadId, contactId: thread.contact?.id ?? null, toEmail: replyTo, subject, thread: (messages ?? []).map((m) => ({ from: m.from?.email ?? "", direction: m.direction, at: m.receivedAt, text: (m.bodyText ?? m.snippet ?? "").slice(0, 4000) })) });
      if (r.ok && r.data) {
        setBody(r.data.draft);
        setReplying(true);
        toast.success("Draft ready. Read it before you send.");
      } else if (!r.ok) toast.error(r.error);
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[15px] font-bold">{thread.subject}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{thread.counterpart.name ?? thread.counterpart.email}</span>
            {thread.contact ? (
              <Link href={`/hq/contacts/${thread.contact.id}`} className="flex items-center gap-1 text-brand hover:underline">
                {thread.contact.name}
                {thread.contact.company ? ` · ${thread.contact.company}` : ""}
              </Link>
            ) : (
              <Button
                variant="soft"
                size="sm"
                className="h-6 px-2 text-[11px]"
                loading={creating}
                onClick={() =>
                  startCreate(async () => {
                    const r = await createContactFromSender({ email: thread.counterpart.email, name: thread.counterpart.name, threadId: thread.threadId });
                    if (r.ok && r.data) {
                      toast.success("Contact created");
                      router.push(`/hq/contacts/${r.data.id}`);
                    } else if (!r.ok) toast.error(r.error);
                  })
                }
              >
                <UserPlus /> Add as contact
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={draft} loading={drafting}>
            <Sparkles /> Draft with assistant
          </Button>
          <Button size="sm" onClick={() => setReplying(true)}>
            <Reply /> Reply
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading || !messages ? (
          <>
            <Skeleton className="h-20" />
            <Skeleton className="h-32" />
          </>
        ) : (
          messages.map((m) => (
            <article key={m.id} className={cn("rounded-lg border border-line p-3", m.direction === "OUTBOUND" ? "bg-brand-tint/25" : "bg-surface")}>
              <header className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                <Avatar name={m.from?.name ?? m.from?.email ?? "?"} size={20} />
                <span className="font-semibold text-ink">{m.from?.name ?? m.from?.email}</span>
                <span className="text-muted">to {m.to.map((t) => t.name ?? t.email).join(", ")}</span>
                <span className="ml-auto flex items-center gap-1 text-faint">
                  <Clock className="size-3" /> {fmtDateTime(m.receivedAt)}
                </span>
                {m.webLink ? (
                  <a href={m.webLink} target="_blank" rel="noreferrer" className="text-muted hover:text-brand" aria-label="Open in mail client">
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </header>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{m.bodyText?.trim() || m.snippet}</div>
              {m.hasAttachments ? <Badge className="mt-2"><Paperclip className="size-3" /> Attachments in your mail client</Badge> : null}
            </article>
          ))
        )}
      </div>
      {replying ? (
        <div className="border-t border-line p-3">
          <div className="mb-2 text-xs text-muted">
            To <span className="font-medium text-ink">{replyTo}</span> · {subject}
          </div>
          <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your reply. Your signature and the company footer are added when it sends." />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-faint">Sent from {me.email}. Logged on the contact timeline.</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setReplying(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={send} loading={sending} disabled={!body.trim()}>
                <Send /> Send
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
