"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Users, Building2, Kanban, FileText, Receipt, LifeBuoy, BookOpen, Plus, Sparkles, ArrowRight } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut, CommandSeparator } from "@/components/ui/command";
import { HQ_NAV, type NavItem } from "@/lib/nav";
import { NavIcon } from "@/components/hq/icons";

const TYPE_ICON: Record<string, React.ElementType> = { contact: Users, company: Building2, deal: Kanban, quote: FileText, invoice: Receipt, ticket: LifeBuoy, sop: BookOpen };

export function CommandPalette({ open, onOpenChange, navItems }: { open: boolean; onOpenChange: (o: boolean) => void; navItems: NavItem[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const debounced = useDebounced(q, 180);
  const search = useQuery({
    queryKey: ["hq-search", debounced],
    queryFn: async () => {
      const r = await fetch(`/api/hq/search?q=${encodeURIComponent(debounced)}`);
      return (await r.json()) as { results: { type: string; id: string; title: string; subtitle: string; href: string }[] };
    },
    enabled: open && debounced.trim().length >= 2,
  });
  React.useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const results = search.data?.results ?? [];
  const quick = [
    { label: "New contact", href: "/hq/contacts?new=1" },
    { label: "New company", href: "/hq/companies?new=1" },
    { label: "New deal", href: "/hq/deals?new=1" },
    { label: "New quote", href: "/hq/quotes/new" },
    { label: "New task", href: "/hq/tasks?new=1" },
    { label: "New ticket", href: "/hq/service/tickets?new=1" },
  ];
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Spectrum HQ">
      <CommandInput placeholder="Search people, companies, deals, quotes, tickets, SOPs, or type a command" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{search.isFetching ? "Searching…" : "Nothing matched. Try a name, company, quote number or SOP topic."}</CommandEmpty>
        {results.length > 0 ? (
          <CommandGroup heading="Results">
            {results.map((r) => {
              const Icon = TYPE_ICON[r.type] ?? ArrowRight;
              return (
                <CommandItem key={`${r.type}-${r.id}`} value={`${r.title} ${r.subtitle} ${r.type}`} onSelect={() => go(r.href)}>
                  <Icon />
                  <span className="truncate">{r.title}</span>
                  <span className="ml-2 truncate text-xs text-muted">{r.subtitle}</span>
                  <CommandShortcut className="capitalize">{r.type}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}
        {q.trim().length >= 2 ? (
          <CommandGroup heading="Ask the assistant">
            <CommandItem value={`ask assistant ${q}`} onSelect={() => go(`/hq/assistant?q=${encodeURIComponent(q)}`)}>
              <Sparkles />
              <span className="truncate">Ask: “{q}”</span>
            </CommandItem>
          </CommandGroup>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Create">
          {quick.map((x) => (
            <CommandItem key={x.href} value={x.label} onSelect={() => go(x.href)}>
              <Plus />
              {x.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Go to">
          {navItems.map((n) => (
            <CommandItem key={n.to} value={`go ${n.label}`} onSelect={() => go(n.to)}>
              <NavIcon name={n.icon} className="size-4" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function flattenNav(groups: typeof HQ_NAV): NavItem[] {
  return groups.flatMap((g) => g.items);
}
