"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Kanban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { convertLeadToDeal } from "@/server/actions/crm";

export function ConvertToDealButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="soft"
      size="sm"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await convertLeadToDeal(contactId);
          if (r.ok && r.data) {
            toast.success("Deal created");
            router.push(`/hq/deals/${r.data.id}`);
          } else if (!r.ok) toast.error(r.error);
        })
      }
    >
      <Kanban /> Create deal
    </Button>
  );
}
