"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// URL driven filters: search box plus any number of selects. Keeps lists bookmarkable and server rendered.
export function FilterBar({ searchPlaceholder = "Search…", selects = [], className, children }: { searchPlaceholder?: string; selects?: { name: string; label: string; options: { value: string; label: string }[] }[]; className?: string; children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  React.useEffect(() => setQ(sp.get("q") ?? ""), [sp]);

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) setParam("q", q);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = [...sp.keys()].filter((k) => k !== "page" && k !== "new" && k !== "edit" && k !== "open" && k !== "view");

  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="pl-8" />
      </div>
      {selects.map((s) => (
        <NativeSelect key={s.name} value={sp.get(s.name) ?? ""} onChange={(e) => setParam(s.name, e.target.value)} className="w-auto min-w-36" aria-label={s.label}>
          <option value="">{s.label}</option>
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {children}
      {active.length ? (
        <button className="flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={() => router.replace(pathname, { scroll: false })}>
          <X className="size-3.5" /> Clear
        </button>
      ) : null}
    </div>
  );
}
