"use client";

import * as React from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startCheckout } from "@/server/actions/invoices";

export function PayButton({ token, amountLabel }: { token: string; amountLabel: string }) {
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await startCheckout(token);
          if (r.ok && r.data) window.location.assign(r.data.url);
          else toast.error(r.ok ? "Could not start the payment." : r.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CreditCard />} Pay {amountLabel} by card or bank
    </Button>
  );
}
