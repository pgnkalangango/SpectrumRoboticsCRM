"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncPaymentToQuickBooks } from "@/server/actions/invoices";

export function PaymentSyncButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await syncPaymentToQuickBooks(paymentId);
          if (r.ok) {
            toast.success("Payment synced to QuickBooks");
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      Sync to QB
    </Button>
  );
}
