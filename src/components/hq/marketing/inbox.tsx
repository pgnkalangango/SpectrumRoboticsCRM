"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, MessageSquare, Reply, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { ProviderChip } from "@/components/hq/marketing/shared";
import { archiveInboxItem, createContactFromInbox, replyToInboxItem } from "@/server/actions/marketing";

export type InboxRow = { id: string; type: string; text: string; authorName: string | null; authorHandle: string | null; receivedAt: string; repliedAt: string | null; status: string; accountName: string; provider: string; contactId: string | null; replies: { text: string; by: string; at: string; sent: boolean; note: string | null }[] };

export function SocialInbox({ items, canReply }: { items: InboxRow[]; canReply: boolean }) {
  const [filter, setFilter] = React.useState<"open" | "replied" | "archived">("open");
  const counts = { open: items.filter((i) => i.status === "open").length, replied: items.filter((i) => i.status === "replied").length, archived: items.filter((i) => i.status === "archived").length };
  const shown = items.filter((i) => i.status === filter);
  return (
    <div>
      <div className="mb-3 inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1">
        {(["open", "replied", "archived"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-md px-3 py-1 text-sm font-medium capitalize", filter === f ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
            {f} <span className="ml-1 rounded bg-surface-3 px-1 text-[10px] tabular">{counts[f]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={MessageSquare} title={filter === "open" ? "Inbox zero" : `No ${filter} items`} body={filter === "open" ? "Comments and messages from connected Facebook and Instagram accounts arrive here through the Meta webhook." : undefined} compact />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((it) => (
            <InboxCard key={it.id} item={it} canReply={canReply} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxCard({ item, canReply }: { item: InboxRow; canReply: boolean }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [replying, setReplying] = React.useState(false);
  const [pending, start] = React.useTransition();
  const who = item.authorName ?? (item.authorHandle ? `@${item.authorHandle}` : "Someone");
  const send = () =>
    start(async () => {
      const r = await replyToInboxItem(item.id, text);
      if (r.ok) {
        toast.success(r.data?.sent ? "Reply sent" : `Marked as replied. ${r.data?.note ?? ""}`);
        setText("");
        setReplying(false);
        router.refresh();
      } else toast.error(r.error);
    });
  const createContact = () =>
    start(async () => {
      const r = await createContactFromInbox(item.id);
      if (r.ok) {
        toast.success("Contact created");
        router.refresh();
      } else toast.error(r.error);
    });
  const archive = (v: boolean) =>
    start(async () => {
      const r = await archiveInboxItem(item.id, v);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  return (
    <li className="rounded-xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <ProviderChip provider={item.provider} name={item.accountName} />
        <Badge variant={item.type === "message" ? "info" : "default"}>{item.type === "message" ? "Direct message" : item.type === "mention" ? "Mention" : "Comment"}</Badge>
        <span className="font-semibold text-ink">{who}</span>
        <span title={fmtDateTime(item.receivedAt)}>{relTime(item.receivedAt)}</span>
        {item.contactId ? (
          <Link href={`/hq/contacts/${item.contactId}`} className="ml-auto font-semibold text-brand hover:underline">
            Open contact
          </Link>
        ) : null}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">{item.text}</p>
      {item.replies.length ? (
        <ul className="mt-2 flex flex-col gap-1 border-l-2 border-brand/40 pl-3">
          {item.replies.map((r, i) => (
            <li key={i} className="text-xs">
              <span className="font-semibold text-ink">{r.by}</span> <span className="text-muted">{relTime(r.at)}</span>
              {!r.sent ? <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] font-semibold text-warn">marked replied</span> : null}
              <p className="text-ink-2">{r.text}</p>
              {r.note ? <p className="text-[11px] text-muted">{r.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {replying ? (
        <div className="mt-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Thanks for reaching out..." autoFocus />
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReplying(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={send} loading={pending} disabled={!text.trim()}>
              Send reply
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {canReply && item.status !== "archived" ? (
            <Button variant="secondary" size="sm" onClick={() => setReplying(true)} disabled={pending}>
              <Reply /> Reply
            </Button>
          ) : null}
          {!item.contactId ? (
            <Button variant="ghost" size="sm" onClick={createContact} disabled={pending}>
              <UserPlus /> Create contact
            </Button>
          ) : null}
          {item.status === "archived" ? (
            <Button variant="ghost" size="sm" onClick={() => archive(false)} disabled={pending}>
              <ArchiveRestore /> Restore
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => archive(true)} disabled={pending}>
              <Archive /> Archive
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
