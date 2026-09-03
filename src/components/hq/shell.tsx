"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronsLeft, HelpCircle, LogOut, Menu, Plus, Search, UserRound, Settings, X, BookOpen, PlayCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn, relTime } from "@/lib/utils";
import type { NavGroup, NavItem } from "@/lib/nav";
import { screenForPath } from "@/lib/nav";
import { NavIcon } from "@/components/hq/icons";
import { SpectrumWordmark, SpectrumBadge } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/hq/command-palette";
import { HqTour, startTour } from "@/components/hq/tour";
import { signOutAction } from "@/server/actions/auth";
import { markNotificationsRead } from "@/server/actions/shell";
import { TIER_LABELS } from "@/lib/permissions";
import type { Tier } from "@/generated/prisma/enums";

export type ShellUser = { id: string; name: string; email: string; image?: string | null; tier: Tier; avatarColor?: string | null; title?: string | null; department?: string | null; tourDone: boolean };
export type ShellNotification = { id: string; title: string; body?: string | null; link?: string | null; createdAt: string; readAt?: string | null; type: string };
export type ScreenSop = { slug: string; title: string; summary?: string | null; category: string };

const SIDEBAR_KEY = "hq-sidebar-collapsed";

export function HqShell({ user, nav, notifications, pendingApprovals, screenSops, children }: { user: ShellUser; nav: NavGroup[]; notifications: ShellNotification[]; pendingApprovals: number; screenSops: ScreenSop[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const allItems = React.useMemo(() => nav.flatMap((g) => g.items), [nav]);
  const unread = notifications.filter((n) => !n.readAt).length;

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {}
  }, []);
  React.useEffect(() => setMobileOpen(false), [pathname]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) setHelpOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const isActive = (item: NavItem) => (item.end ? pathname === item.to : pathname.startsWith(item.to));

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center border-b border-sidebar-line px-3", collapsed ? "justify-center" : "justify-between")}>
        <Link href="/hq" className="flex items-center gap-2 overflow-hidden">
          {collapsed ? <SpectrumBadge size={30} /> : <SpectrumWordmark className="h-8" color="#4DD0D2" subColor="#9DB0B5" bg="var(--sidebar)" />}
        </Link>
        {!collapsed ? (
          <button onClick={toggleCollapsed} className="hidden rounded-md p-1 text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-ink lg:block" aria-label="Collapse sidebar">
            <ChevronsLeft className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {nav.map((group) => (
          <div key={group.group} className="mb-4">
            {!collapsed ? <div className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">{group.group}</div> : <div className="mx-2 mb-2 h-px bg-sidebar-line" />}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item);
                const badge = item.screen === "approvals" && pendingApprovals > 0 ? pendingApprovals : item.screen === "inbox" ? 0 : 0;
                const link = (
                  <Link
                    href={item.to}
                    data-tour={item.tour}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] font-medium text-sidebar-ink/85 transition-colors hover:bg-sidebar-2 hover:text-white",
                      active && "bg-brand/15 text-white hover:bg-brand/20",
                      collapsed && "justify-center px-0",
                    )}
                  >
                    {active ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-brand-bright" /> : null}
                    <NavIcon name={item.icon} className={cn("size-[17px] shrink-0", active ? "text-brand-bright" : "text-sidebar-muted group-hover:text-sidebar-ink")} />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {!collapsed && badge ? <span className="ml-auto rounded-full bg-warn px-1.5 text-[10px] font-bold text-white">{badge}</span> : null}
                  </Link>
                );
                return <li key={item.to}>{collapsed ? <Tooltip content={item.label} side="right">{link}</Tooltip> : link}</li>;
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className={cn("border-t border-sidebar-line p-2", collapsed && "flex justify-center")}>
        {collapsed ? (
          <button onClick={toggleCollapsed} className="rounded-md p-1.5 text-sidebar-muted hover:bg-sidebar-2 hover:text-sidebar-ink" aria-label="Expand sidebar">
            <ChevronsLeft className="size-4 rotate-180" />
          </button>
        ) : (
          <Link href="/hq/me" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-sidebar-2">
            <Avatar name={user.name} src={user.image} size={30} color={user.avatarColor} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-white">{user.name}</div>
              <div className="truncate text-[11px] text-sidebar-muted">
                {TIER_LABELS[user.tier]}
                {user.department ? ` · ${user.department}` : ""}
              </div>
            </div>
          </Link>
        )}
      </div>
    </nav>
  );

  const screen = screenForPath(pathname);

  return (
    <div className="flex min-h-screen">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 bg-sidebar text-sidebar-ink transition-[width] duration-200 lg:block", collapsed ? "w-[64px]" : "w-[236px]")}>{sidebar}</aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" width="max-w-[280px]" className="bg-sidebar p-0 text-sidebar-ink border-sidebar-line [&>button]:text-sidebar-muted">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur md:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <button
            data-tour="search"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 flex-1 max-w-md items-center gap-2 rounded-lg border border-line bg-surface-2/70 px-3 text-left text-sm text-muted transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate">Search or jump to…</span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="sm" className="hidden sm:inline-flex">
                  <Plus /> New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => router.push("/hq/contacts?new=1")}>Contact</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/hq/companies?new=1")}>Company</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/hq/deals?new=1")}>Deal</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/hq/quotes/new")}>Quote</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/hq/tasks?new=1")}>Task</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/hq/service/tickets?new=1")}>Ticket</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/hq/marketing?new=1")}>Social post</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationsMenu notifications={notifications} unread={unread} />
            <Tooltip content="Help and SOPs for this page (?)">
              <Button variant="ghost" size="icon" data-tour="help" onClick={() => setHelpOpen(true)} aria-label="Help">
                <HelpCircle />
              </Button>
            </Tooltip>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 rounded-full ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label="Account menu">
                  <Avatar name={user.name} src={user.image} size={32} color={user.avatarColor} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="normal-case tracking-normal">
                  <div className="text-sm font-semibold text-ink">{user.name}</div>
                  <div className="truncate text-xs font-normal text-muted">{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/hq/me")}>
                  <UserRound /> My profile
                </DropdownMenuItem>
                {user.tier === "OWNER" ? (
                  <DropdownMenuItem onSelect={() => router.push("/hq/settings")}>
                    <Settings /> Company settings
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => startTour()}>
                  <PlayCircle /> Replay the walkthrough
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOutAction()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 md:px-7 md:py-6 animate-fade-in">
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} navItems={allItems} />
      <HelpDrawer open={helpOpen} onOpenChange={setHelpOpen} screen={screen} sops={screenSops} />
      <HqTour autoStart={!user.tourDone} />
    </div>
  );
}

function NotificationsMenu({ notifications, unread }: { notifications: ShellNotification[]; unread: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o && unread > 0) markNotificationsRead().catch(() => null);
  };
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {unread > 0 ? <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-bad text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 ? (
            <button className="text-xs text-brand hover:underline" onClick={() => markNotificationsRead().then(() => toast.success("Marked as read"))}>
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">You are all caught up.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setOpen(false);
                  if (n.link) router.push(n.link);
                }}
                className={cn("flex w-full flex-col items-start gap-0.5 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-surface-2", !n.readAt && "bg-brand-tint/30")}
              >
                <span className="flex w-full items-center gap-2 text-[13px] font-medium text-ink">
                  {!n.readAt ? <span className="size-1.5 shrink-0 rounded-full bg-brand" /> : null}
                  <span className="truncate">{n.title}</span>
                  <span className="ml-auto shrink-0 text-[11px] font-normal text-faint">{relTime(n.createdAt)}</span>
                </span>
                {n.body ? <span className="line-clamp-2 text-xs text-muted">{n.body}</span> : null}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-line px-3 py-2 text-center">
          <Link href="/hq/notifications" className="text-xs text-muted hover:text-ink" onClick={() => setOpen(false)}>
            See all
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HelpDrawer({ open, onOpenChange, screen, sops }: { open: boolean; onOpenChange: (o: boolean) => void; screen: string | null; sops: ScreenSop[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent width="max-w-md">
        <SheetHeader>
          <SheetTitle>Help for this page</SheetTitle>
          <p className="text-sm text-muted">SOPs and tips that apply to {screen ? screen.replace(/_/g, " ") : "this screen"}.</p>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface-2/60 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <PlayCircle className="size-4 text-brand" /> New here?
            </div>
            <p className="text-muted">Take the two minute walkthrough of the main screens.</p>
            <Button size="sm" variant="soft" className="mt-2" onClick={() => { onOpenChange(false); setTimeout(startTour, 250); }}>
              Start the walkthrough
            </Button>
          </div>
          <div>
            <div className="eyebrow mb-2">SOPs for this screen</div>
            {sops.length === 0 ? (
              <p className="text-sm text-muted">No SOP is linked to this screen yet. Browse the full library below.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sops.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/hq/sops/${s.slug}`} onClick={() => onOpenChange(false)} className="block rounded-lg border border-line p-3 hover:border-brand hover:bg-brand-tint/20">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <BookOpen className="size-4 text-brand" /> {s.title}
                      </div>
                      {s.summary ? <p className="mt-1 line-clamp-2 text-xs text-muted">{s.summary}</p> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link href="/hq/sops" onClick={() => onOpenChange(false)}>
                Open the SOP library
              </Link>
            </Button>
          </div>
          <div>
            <div className="eyebrow mb-2">Keyboard shortcuts</div>
            <ul className="flex flex-col gap-1.5 text-sm">
              <li className="flex items-center justify-between"><span>Search or create</span><span className="flex gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span></li>
              <li className="flex items-center justify-between"><span>Open help</span><Kbd>?</Kbd></li>
              <li className="flex items-center justify-between"><span>Close a panel</span><Kbd>Esc</Kbd></li>
            </ul>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export { X, Check };
