"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/misc";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type PickerValue = { id: string; label: string; sub?: string } | null;
export type PickerType = "contact" | "company" | "deal" | "user" | "product" | "site" | "robot" | "sop";

export function EntityPicker({ type, value, onChange, placeholder, companyId, className, disabled, allowClear = true }: { type: PickerType; value: PickerValue; onChange: (v: PickerValue) => void; placeholder?: string; companyId?: string | null; className?: string; disabled?: boolean; allowClear?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const query = useQuery({
    queryKey: ["lookup", type, q, companyId ?? ""],
    queryFn: async () => {
      const params = new URLSearchParams({ type, q });
      if (companyId) params.set("companyId", companyId);
      const r = await fetch(`/api/hq/lookup?${params}`);
      return ((await r.json()) as { items: NonNullable<PickerValue>[] }).items;
    },
    enabled: open,
  });
  const items = query.data ?? [];
  const labels: Record<PickerType, string> = { contact: "a contact", company: "a company", deal: "a deal", user: "a person", product: "a product", site: "a site", robot: "a robot", sop: "an SOP" };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn("flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60", className)}
        >
          <span className={cn("flex-1 truncate", !value && "text-faint")}>{value ? value.label : (placeholder ?? `Choose ${labels[type]}`)}</span>
          {value && allowClear ? (
            <span
              role="button"
              aria-label="Clear"
              className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="size-3.5" />
            </span>
          ) : null}
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search ${labels[type]}…`} value={q} onValueChange={setQ} className="h-10 text-sm" />
          <CommandList className="max-h-64">
            <CommandEmpty>{query.isFetching ? "Loading…" : "No matches."}</CommandEmpty>
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.id}
                  value={it.id}
                  onSelect={() => {
                    onChange(it);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value?.id === it.id ? "opacity-100 text-brand" : "opacity-0")} />
                  <span className="truncate">{it.label}</span>
                  {it.sub ? <span className="ml-auto truncate pl-2 text-xs text-muted">{it.sub}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
