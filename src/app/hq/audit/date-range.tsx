"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

// Two date inputs that write ?from= and ?to= to the URL alongside the FilterBar selects.
export function DateRange() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (name: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      <Input type="date" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} className="w-36" aria-label="From date" />
      <span>to</span>
      <Input type="date" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} className="w-36" aria-label="To date" />
    </div>
  );
}
