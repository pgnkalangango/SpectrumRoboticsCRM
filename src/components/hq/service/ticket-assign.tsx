"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EntityPicker, type PickerValue } from "@/components/hq/entity-picker";
import { assignTicket } from "@/server/actions/service";

// Reassign picker. The parent keys this on the current assignee id so a server refresh resets the local value.
export function TicketAssign({ ticketId, assignee }: { ticketId: string; assignee: PickerValue }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [value, setValue] = React.useState<PickerValue>(assignee);
  return (
    <EntityPicker
      type="user"
      value={value}
      disabled={pending}
      placeholder="Unassigned"
      onChange={(v) => {
        setValue(v);
        start(async () => {
          const r = await assignTicket(ticketId, v?.id ?? null);
          if (r.ok) {
            toast.success(v ? `Assigned to ${v.label}` : "Unassigned");
            router.refresh();
          } else {
            toast.error(r.error);
            setValue(assignee);
          }
        });
      }}
    />
  );
}
