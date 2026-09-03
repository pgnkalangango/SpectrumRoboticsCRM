"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, UserRound, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { PORTAL_NAV } from "@/lib/nav";
import { NavIcon } from "@/components/hq/icons";
import { SpectrumWordmark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAction } from "@/server/actions/auth";

export function PortalShell({ user, company, staffView, children }: { user: { name: string; email: string; image?: string | null }; company: { name: string; accountManager?: { name: string; email: string; phone?: string | null } | null } | null; staffView: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);
  const nav = (
    <ul className="flex flex-col gap-0.5">
      {PORTAL_NAV.map((item) => {
        const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <li key={item.to}>
            <Link href={item.to} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink", active && "bg-brand-tint text-brand-deep hover:bg-brand-tint dark:text-brand-bright")}>
              <NavIcon name={item.icon} className={cn("size-[18px]", active ? "text-brand" : "text-muted")} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className="min-h-screen bg-ground">
      {staffView ? <div className="bg-warn-soft px-4 py-1.5 text-center text-xs font-medium text-warn">You are viewing the client portal as a team member. <Link href="/hq" className="underline">Back to HQ</Link></div> : null}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu />
          </Button>
          <Link href="/portal" className="flex items-center gap-3">
            <SpectrumWordmark className="h-9" />
            <span className="hidden border-l border-line pl-3 text-sm font-semibold text-muted sm:inline">Client portal</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 flex items-center gap-2 rounded-full focus-visible:outline-none" aria-label="Account menu">
                  <Avatar name={user.name} src={user.image} size={34} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="normal-case tracking-normal">
                  <div className="text-sm font-semibold text-ink">{user.name}</div>
                  <div className="truncate text-xs font-normal text-muted">{company?.name ?? user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/portal/profile">
                    <UserRound /> My profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => signOutAction()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" width="max-w-[280px]" className="p-4">
          <SheetTitle className="mb-4 font-display text-lg">Menu</SheetTitle>
          {nav}
        </SheetContent>
      </Sheet>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[220px_1fr] md:px-6">
        <aside className="hidden md:block">
          <div className="sticky top-24 flex flex-col gap-6">
            {nav}
            {company?.accountManager ? (
              <div className="rounded-xl border border-line bg-surface p-4 text-sm">
                <div className="eyebrow mb-2">Your Spectrum contact</div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={company.accountManager.name} size={32} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{company.accountManager.name}</div>
                    <div className="truncate text-xs text-muted">Account manager</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-1 text-xs text-ink-2">
                  <a href={`mailto:${company.accountManager.email}`} className="flex items-center gap-1.5 hover:text-brand"><Mail className="size-3.5" /> {company.accountManager.email}</a>
                  {company.accountManager.phone ? <a href={`tel:${company.accountManager.phone}`} className="flex items-center gap-1.5 hover:text-brand"><Phone className="size-3.5" /> {company.accountManager.phone}</a> : null}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-4 text-sm">
                <div className="eyebrow mb-2">Need help?</div>
                <p className="text-xs text-ink-2">Call (630) 809-9698 or email info@spectrumrobotics.ai. Support tickets get the fastest response.</p>
              </div>
            )}
          </div>
        </aside>
        <main className="min-w-0 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
