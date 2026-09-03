"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { addTicketComment } from "@/server/actions/service";

export type CommentItem = { id: string; body: string; internal: boolean; createdAt: string; author: { id: string; name: string; image: string | null; avatarColor: string | null; kind: "STAFF" | "CLIENT" } | null };

export function TicketComments({ ticketId, comments, clientVisible, contactName }: { ticketId: string; comments: CommentItem[]; clientVisible: boolean; contactName?: string | null }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [pending, start] = React.useTransition();

  const submit = () => {
    if (!body.trim()) return;
    start(async () => {
      const r = await addTicketComment(ticketId, body, internal);
      if (r.ok) {
        setBody("");
        toast.success(internal ? "Note saved" : "Reply sent");
        router.refresh();
      } else toast.error(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={cn("rounded-xl border bg-surface p-3 shadow-sm transition-colors", internal ? "border-warn/60 bg-warn-soft/30" : "border-line")}>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={internal ? "Internal note. Only the team sees this." : clientVisible ? `Reply to ${contactName ?? "the customer"}. They get a notification in their portal.` : "Reply. This ticket is hidden from the client portal, so only the team sees it."}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
          }}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs font-medium text-ink-2">
            <Switch checked={internal} onCheckedChange={setInternal} aria-label="Internal note" />
            <Lock className={cn("size-3.5", internal ? "text-warn" : "text-muted")} /> Internal note
            <span className="text-faint">{internal ? "Never sent to the client" : ""}</span>
          </label>
          <Button size="sm" onClick={submit} loading={pending} disabled={!body.trim()} variant={internal ? "secondary" : "default"}>
            {internal ? "Save note" : "Send reply"}
          </Button>
        </div>
      </div>

      {comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No replies yet. The first public reply stops the SLA clock.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const who = c.author?.name ?? "Client";
            const isClient = c.author?.kind === "CLIENT" || !c.author;
            return (
              <li key={c.id} className={cn("flex gap-3 rounded-lg border p-3 shadow-sm", c.internal ? "border-warn/50 bg-warn-soft/40" : isClient ? "border-brand/30 bg-brand-mist" : "border-line bg-surface")}>
                <Avatar name={who} src={c.author?.image} color={c.author?.avatarColor} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="font-semibold text-ink">{who}</span>
                    {c.internal ? (
                      <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">
                        <Lock className="size-3" /> Internal
                      </span>
                    ) : isClient ? (
                      <span className="inline-flex items-center gap-1 rounded bg-brand-tint px-1.5 text-[11px] font-semibold text-brand-deep dark:text-brand-bright">
                        <MessageSquare className="size-3" /> Client
                      </span>
                    ) : null}
                    <span className="ml-auto text-[11px] text-faint" title={fmtDateTime(c.createdAt)}>
                      {relTime(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
