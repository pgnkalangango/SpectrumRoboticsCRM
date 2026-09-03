"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Switch } from "@/components/ui/misc";
import { setProductPublished } from "@/server/actions/catalog";

export function PublishToggle({ id, published, name }: { id: string; published: boolean; name: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(published);
  const [seen, setSeen] = React.useState(published);
  const [pending, start] = React.useTransition();
  // Adopt the server value when it changes after a refresh (state adjustment during render).
  if (seen !== published) {
    setSeen(published);
    setValue(published);
  }
  return (
    <Switch
      checked={value}
      disabled={pending}
      aria-label={`${value ? "Unpublish" : "Publish"} ${name}`}
      onCheckedChange={(v) => {
        setValue(v);
        start(async () => {
          const r = await setProductPublished(id, v);
          if (r.ok) {
            toast.success(v ? `${name} published` : `${name} unpublished`);
            router.refresh();
          } else {
            setValue(!v);
            toast.error(r.error);
          }
        });
      }}
    />
  );
}
