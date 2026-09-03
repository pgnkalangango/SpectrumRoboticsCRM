import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Image as ImageIcon, LayoutList, Megaphone, MessageSquare, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { PageHeader, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterBar } from "@/components/hq/filter-bar";
import { ContentCalendar } from "@/components/hq/marketing/calendar";
import { dateKey } from "@/components/hq/marketing/dates";
import { PostSheetFromUrl } from "@/components/hq/marketing/post-sheet";
import { SocialInbox, type InboxRow } from "@/components/hq/marketing/inbox";
import { AssetLibrary } from "@/components/hq/marketing/assets";
import { ProviderChip, POST_STATUS_LABEL, PROVIDER_META, type AccountOption, type HistoryRow, type PostRow } from "@/components/hq/marketing/shared";
import type { Prisma } from "@/generated/prisma/client";
import type { ClaimsResult } from "@/lib/claims-check";

export const metadata = { title: "Content" };

const TABS = [
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "posts", label: "Posts", icon: LayoutList },
  { key: "inbox", label: "Inbox", icon: MessageSquare },
  { key: "assets", label: "Assets", icon: ImageIcon },
] as const;

const postInclude = { targets: { include: { socialAccount: { select: { id: true, name: true, provider: true } } } }, campaign: { select: { name: true } }, author: { select: { name: true } }, approvedBy: { select: { name: true } } } satisfies Prisma.SocialPostInclude;
type PostWithRels = Prisma.SocialPostGetPayload<{ include: typeof postInclude }>;

function serializePost(p: PostWithRels): PostRow {
  const claims = p.claimsCheck as ClaimsResult | null;
  const stats = (p.stats as { publishedAt?: string; notes?: string } | null) ?? {};
  const publishedAt = stats.publishedAt ?? p.targets.map((t) => t.publishedAt).filter(Boolean).sort()[0]?.toISOString() ?? null;
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    status: p.status,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    publishedAt: p.status === "PUBLISHED" ? publishedAt ?? p.updatedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    mediaUrls: p.mediaUrls,
    linkUrl: p.linkUrl,
    campaignId: p.campaignId,
    campaignName: p.campaign?.name ?? null,
    canvaDesignId: p.canvaDesignId,
    authorId: p.authorId,
    authorName: p.author?.name ?? null,
    approvedByName: p.approvedBy?.name ?? null,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    notes: stats.notes ?? null,
    claimsBlocked: !!claims?.blocked,
    claimsWarnings: claims?.findings?.filter((f) => f.severity === "warn").length ?? 0,
    targets: p.targets.map((t) => ({ id: t.id, accountId: t.socialAccountId, accountName: t.socialAccount.name, provider: t.socialAccount.provider, status: t.status, externalUrl: t.externalUrl, error: t.error, publishedAt: t.publishedAt?.toISOString() ?? null })),
  };
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "calendar") as (typeof TABS)[number]["key"];
  const view = sp.view === "week" ? "week" : "month";
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : dateKey(new Date());
  const canDraft = can(user, "social.draft");
  const canPost = can(user, "social.post");
  const social = await getSetting("social");

  const [accounts, campaigns, knownCompanies] = await Promise.all([
    prisma.socialAccount.findMany({ where: { status: "connected" }, orderBy: [{ provider: "asc" }, { name: "asc" }] }),
    prisma.campaign.findMany({ where: { status: { in: ["planned", "active", "paused"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.company.findMany({ where: { status: { in: ["ACTIVE", "PARTNER"] } }, select: { name: true } }),
  ]);
  const accountOptions: AccountOption[] = accounts.map((a) => ({ id: a.id, provider: a.provider, name: a.name, handle: a.handle, status: a.status }));

  // Post detail for ?open=id, with its status history from the audit log.
  let detail: PostRow | null = null;
  let history: HistoryRow[] = [];
  if (sp.open) {
    const p = await prisma.socialPost.findUnique({ where: { id: sp.open }, include: postInclude });
    if (p) {
      detail = serializePost(p);
      const logs = await prisma.auditLog.findMany({ where: { entityType: "SocialPost", entityId: p.id }, orderBy: { createdAt: "desc" }, take: 30, include: { actor: { select: { name: true } } } });
      history = logs.map((l) => {
        const after = (l.after as Record<string, unknown> | null) ?? {};
        const note = l.action === "reject" && after.note ? String(after.note) : l.action === "publish_failed" && Array.isArray(after.errors) ? (after.errors as { account: string; error: string }[]).map((e) => `${e.account}: ${e.error}`).join("; ") : after.overrideClaims ? "Claims check overridden" : null;
        return { id: l.id, action: l.action, actor: l.actor?.name ?? l.actorEmail ?? "System", at: l.createdAt.toISOString(), note };
      });
    }
  }

  // Calendar range: the visible month plus a week on each side, or the visible week.
  const anchor = new Date(`${date}T00:00:00`);
  const rangeStart = view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth(), -7) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay() - 1);
  const rangeEnd = view === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 14) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay() + 8);

  const q = sp.q?.trim();
  const listWhere: Prisma.SocialPostWhereInput = {
    ...(sp.status ? { status: sp.status as Prisma.SocialPostWhereInput["status"] } : {}),
    ...(sp.provider ? { targets: { some: { socialAccount: { provider: sp.provider as Prisma.SocialAccountWhereInput["provider"] } } } } : {}),
    ...(sp.campaign ? { campaignId: sp.campaign } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const [calendarPosts, listPosts, counts] = await Promise.all([
    tab === "calendar" ? prisma.socialPost.findMany({ where: { OR: [{ scheduledAt: { gte: rangeStart, lte: rangeEnd } }, { status: "PUBLISHED", updatedAt: { gte: rangeStart, lte: rangeEnd } }] }, include: postInclude, orderBy: { scheduledAt: "asc" } }) : Promise.resolve([] as PostWithRels[]),
    tab === "posts" ? prisma.socialPost.findMany({ where: listWhere, include: postInclude, orderBy: [{ updatedAt: "desc" }], take: 200 }) : Promise.resolve([] as PostWithRels[]),
    prisma.socialPost.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  const inboxItems: InboxRow[] =
    tab === "inbox"
      ? (await prisma.socialInboxItem.findMany({ orderBy: { receivedAt: "desc" }, take: 200, include: { socialAccount: { select: { name: true, provider: true } } } })).map((i) => {
          const meta = (i.metadata as { contactId?: string; replies?: InboxRow["replies"] } | null) ?? {};
          return { id: i.id, type: i.type, text: i.text, authorName: i.authorName, authorHandle: i.authorHandle, receivedAt: i.receivedAt.toISOString(), repliedAt: i.repliedAt?.toISOString() ?? null, status: i.status, accountName: i.socialAccount.name, provider: i.socialAccount.provider, contactId: meta.contactId ?? null, replies: meta.replies ?? [] };
        })
      : [];
  const assets = tab === "assets" ? (await prisma.contentAsset.findMany({ orderBy: { createdAt: "desc" }, take: 200 })).map((a) => ({ id: a.id, name: a.name, url: a.url, type: a.type, tags: a.tags, createdAt: a.createdAt.toISOString(), canvaDesignId: a.canvaDesignId })) : [];
  const openInbox = tab === "inbox" ? inboxItems.filter((i) => i.status === "open").length : await prisma.socialInboxItem.count({ where: { status: "open" } });

  const tabHref = (key: string) => {
    const next = new URLSearchParams();
    if (key !== "calendar") next.set("tab", key);
    return next.size ? `/hq/marketing?${next}` : "/hq/marketing";
  };
  const pendingCount = count("PENDING_APPROVAL");

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle={`${count("SCHEDULED")} scheduled · ${count("PUBLISHED")} published · ${pendingCount} waiting for approval${accounts.length === 0 ? " · no channels connected yet" : ""}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/hq/marketing/campaigns">
                <Megaphone /> Campaigns
              </Link>
            </Button>
            {canDraft ? (
              <Button asChild>
                <Link href={`${tabHref(tab)}${tab === "calendar" ? "?" : "&"}new=1`}>
                  <Plus /> New post
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {pendingCount > 0 && canPost && tab !== "posts" ? (
        <Link href="/hq/marketing?tab=posts&status=PENDING_APPROVAL" className="mb-4 flex items-center justify-between rounded-xl border border-warn/30 bg-warn-soft/50 px-4 py-2.5 text-sm text-ink hover:bg-warn-soft">
          <span>
            <span className="font-semibold">{pendingCount} post{pendingCount === 1 ? "" : "s"}</span> waiting for your approval.
          </span>
          <span className="text-xs font-semibold text-warn">Review</span>
        </Link>
      ) : null}
      <nav className="mb-4 flex items-center gap-4 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} className={cn("-mb-px flex items-center gap-1.5 border-b-2 px-0.5 py-2.5 text-sm font-medium transition-colors", tab === t.key ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink")}>
            <t.icon className="size-4" /> {t.label}
            {t.key === "inbox" && openInbox > 0 ? <span className="rounded bg-brand-tint px-1 text-[10px] font-semibold text-brand-deep dark:text-brand-bright">{openInbox}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "calendar" ? (
        accounts.length === 0 && calendarPosts.length === 0 ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-line bg-surface p-4 text-sm text-ink-2">
              No social accounts are connected yet. {canPost ? <>Connect LinkedIn, Facebook and Instagram from <Link href="/hq/integrations" className="font-semibold text-brand hover:underline">Integrations</Link>, then posts you schedule show up here.</> : "Ask an owner to connect LinkedIn, Facebook and Instagram from Integrations. You can draft posts in the meantime."}
            </div>
            <ContentCalendar posts={[]} view={view} date={date} canDraft={canDraft} />
          </div>
        ) : (
          <ContentCalendar posts={calendarPosts.map(serializePost)} view={view} date={date} canDraft={canDraft} />
        )
      ) : null}

      {tab === "posts" ? (
        <>
          <FilterBar
            searchPlaceholder="Search posts"
            selects={[
              { name: "status", label: "All statuses", options: Object.entries(POST_STATUS_LABEL).map(([value, label]) => ({ value, label })) },
              { name: "provider", label: "Any channel", options: Object.entries(PROVIDER_META).slice(0, 3).map(([value, m]) => ({ value, label: m.label })) },
              { name: "campaign", label: "Any campaign", options: campaigns.map((c) => ({ value: c.id, label: c.name })) },
            ]}
          />
          {listPosts.length === 0 ? (
            <EmptyState icon={LayoutList} title={q || sp.status || sp.provider ? "No posts match" : "No posts yet"} body={q || sp.status ? "Try clearing the filters." : "Write the first post. It starts as a draft and goes out once approved and scheduled."} action={canDraft ? <Button asChild><Link href="/hq/marketing?tab=posts&new=1"><Plus /> New post</Link></Button> : undefined} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Post</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Claims</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listPosts.map(serializePost).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-md">
                      <Link href={`/hq/marketing?tab=posts&open=${p.id}`} className="block font-medium text-ink hover:text-brand">
                        {p.title ?? <span className="text-ink-2">{p.body.slice(0, 80)}{p.body.length > 80 ? "…" : ""}</span>}
                      </Link>
                      {p.title ? <div className="truncate text-xs text-muted">{p.body.slice(0, 90)}</div> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.targets.length === 0 ? <span className="text-xs text-faint">None</span> : p.targets.map((t) => <ProviderChip key={t.id} provider={t.provider} name={t.accountName} muted={t.status === "failed"} />)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={p.status} labelOverride={POST_STATUS_LABEL[p.status]} />
                    </TableCell>
                    <TableCell className="text-xs text-ink-2">{p.publishedAt ? `Published ${relTime(p.publishedAt)}` : p.scheduledAt ? fmtDateTime(p.scheduledAt) : <span className="text-faint">Not scheduled</span>}</TableCell>
                    <TableCell className="text-xs text-ink-2">{p.campaignName ?? <span className="text-faint">None</span>}</TableCell>
                    <TableCell className="text-xs text-ink-2">{p.authorName ?? ""}</TableCell>
                    <TableCell>{p.claimsBlocked ? <StatusBadge value="FAILED" labelOverride="Blocked" /> : p.claimsWarnings ? <StatusBadge value="PENDING" labelOverride={`${p.claimsWarnings} to review`} /> : <StatusBadge value="APPROVED" labelOverride="Clean" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}

      {tab === "inbox" ? <SocialInbox items={inboxItems} canReply={canDraft} /> : null}
      {tab === "assets" ? <AssetLibrary assets={assets} canEdit={canDraft} /> : null}

      <Suspense>
        <PostSheetFromUrl detail={detail} history={history} accounts={accountOptions} campaigns={campaigns} knownCompanies={knownCompanies.map((c) => c.name)} canPost={canPost} canDraft={canDraft} requireApproval={social.requireApproval} currentUserId={user.id} />
      </Suspense>
    </div>
  );
}
