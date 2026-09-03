"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { portalAddComment } from "@/server/actions/portal";

export function TicketReply({ ticketId, preview, closed }: { ticketId: string; preview: string | null; closed: boolean }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, start] = React.useTransition();
  const submit = () => {
    if (!body.trim()) return;
    start(async () => {
      const r = await portalAddComment(ticketId, body, preview);
      if (r.ok) {
        setBody("");
        toast.success("Reply sent");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <label className="mb-2 block text-[13px] font-semibold text-ink-2">{closed ? "This ticket is closed. Reply if the problem came back and we will reopen it." : "Reply to the team"}</label>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="text-[15px]"
        placeholder="Add details, answer a question, or let us know it is working again."
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />
      <div className="mt-3 flex justify-end">
        <Button size="lg" onClick={submit} loading={pending} disabled={!body.trim()}>
          Send reply
        </Button>
      </div>
    </div>
  );
}
