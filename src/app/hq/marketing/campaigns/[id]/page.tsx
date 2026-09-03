import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, label, money, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Stat } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { CampaignSheetFromUrl } from "@/components/hq/marketing/campaign-sheet";
import { ProviderChip, POST_STATUS_LABEL } from "@/components/hq/marketing/shared";

const STATUS_TONE: Record<string, string> = { planned: "PROSPECT", active: "ACTIVE", paused: "PAUSED", completed: "DONE" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const c = await prisma.campaign.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, image: true, avatarColor: true } },
      posts: { orderBy: [{ scheduledAt: "desc" }, { updatedAt: "desc" }], include: { targets: { include: { socialAccount: { select: { name: true, provider: true } } } }, author: { select: { name: true } } } },
      deals: { orderBy: { updatedAt: "desc" }, include: { company: { select: { id: true, name: true } }, stage: true, owner: { select: { name: true } } } },
    },
  });
  if (!c) notFound();
  const canDraft = can(user, "social.draft");
  const published = c.posts.filter((p) => p.status === "PUBLISHED").length;
  const pipeline = c.deals.filter((d) => !d.stage.isWon && !d.stage.isLost).reduce((a, d) => a + Number(d.value), 0);
  const won = c.deals.filter((d) => d.stage.isWon).reduce((a, d) => a + Number(d.value), 0);
  const wonMonthly = c.deals.filter((d) => d.stage.isWon).reduce((a, d) => a + Number(d.monthlyValue), 0);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Marketing", href: "/hq/marketing" }, { label: "Campaigns", href: "/hq/marketing/campaigns" }, { label: c.name }]} />
      <RecordHeader
        title={c.name}
        badges={<StatusBadge value={STATUS_TONE[c.status] ?? c.status} labelOverride={label(c.status)} />}
        subtitle={[label(c.type), c.channel, c.startDate || c.endDate ? `${fmtDate(c.startDate) || "…"} to ${fmtDate(c.endDate) || "…"}` : null].filter(Boolean).join(" · ")}
        actions={
          canDraft ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link href={`/hq/marketing?new=1`}>
                  <Plus /> New post
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/hq/marketing/campaigns/${c.id}?edit=1`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Posts published" value={published} sub={`${c.posts.length} total in the campaign`} />
        <Stat label="Deals attributed" value={c.deals.length} sub={`${c.deals.filter((d) => d.stage.isWon).length} won`} />
        <Stat label="Open pipeline" value={money(pipeline)} tone="brand" />
        <Stat label="Won value" value={money(won)} sub={wonMonthly ? `${money(wonMonthly)}/mo recurring` : undefined} tone={won ? "ok" : "default"} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Owner", value: c.owner ? <span className="flex items-center gap-1.5"><Avatar name={c.owner.name} src={c.owner.image} color={c.owner.avatarColor} size={18} /> {c.owner.name}</span> : null },
                { label: "Budget", value: c.budget ? money(Number(c.budget)) : null },
                { label: "UTM campaign", value: c.utmCampaign },
                { label: "Created", value: fmtDate(c.createdAt) },
              ]}
            />
          </Panel>
          {c.description ? (
            <Panel title="Description">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{c.description}</p>
            </Panel>
          ) : null}
          <Panel title="How deals get here">
            <p className="text-sm text-ink-2">Reps pick the campaign on the deal form. Any deal with this campaign selected is counted above, so attribution needs no extra work here.</p>
          </Panel>
        </div>
        <div className="flex flex-col gap-5">
          <section>
            <h2 className="eyebrow mb-2">Posts</h2>
            {c.posts.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No posts in this campaign yet. Pick it in the campaign field when you write a post.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Post</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.posts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/hq/marketing?tab=posts&open=${p.id}`} className="font-medium hover:text-brand">
                          {p.title ?? p.body.slice(0, 70)}
                        </Link>
                        <div className="text-xs text-muted">{p.author?.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">{p.targets.map((t) => <ProviderChip key={t.id} provider={t.socialAccount.provider} name={t.socialAccount.name} />)}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge value={p.status} labelOverride={POST_STATUS_LABEL[p.status]} />
                      </TableCell>
                      <TableCell className="text-xs text-ink-2">{p.scheduledAt ? fmtDateTime(p.scheduledAt) : relTime(p.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
          <section>
            <h2 className="eyebrow mb-2">Deals</h2>
            {c.deals.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No deals attributed yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.deals.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <Link href={`/hq/deals/${d.id}`} className="font-medium hover:text-brand">
                          {d.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-ink-2">{d.company ? <Link href={`/hq/companies/${d.company.id}`} className="hover:text-brand">{d.company.name}</Link> : null}</TableCell>
                      <TableCell>
                        <StatusBadge value={d.stageKey} labelOverride={d.stage.label} />
                      </TableCell>
                      <TableCell className="text-right tabular">{money(Number(d.value))}</TableCell>
                      <TableCell className="text-xs text-ink-2">{d.owner?.name}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      </div>
      <CampaignSheetFromUrl canDelete={user.tier !== "EMPLOYEE"} initial={{ id: c.id, name: c.name, type: c.type as "social", status: c.status as "planned", channel: c.channel, description: c.description, startDate: c.startDate?.toISOString().slice(0, 10) ?? "", endDate: c.endDate?.toISOString().slice(0, 10) ?? "", budget: c.budget ? Number(c.budget) : undefined, utmCampaign: c.utmCampaign, owner: c.owner ? { id: c.owner.id, label: c.owner.name } : null }} />
    </div>
  );
}
