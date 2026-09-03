"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/misc";
import { setTaskStatus } from "@/server/actions/tasks";

export function TaskQuickComplete({ id, done = false }: { id: string; done?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Checkbox
      checked={done}
      disabled={pending}
      aria-label="Mark done"
      onCheckedChange={(v) =>
        start(async () => {
          const r = await setTaskStatus(id, v ? "DONE" : "TODO");
          if (r.ok) toast.success(v ? "Done" : "Reopened");
          else toast.error(r.error);
        })
      }
    />
  );
}
