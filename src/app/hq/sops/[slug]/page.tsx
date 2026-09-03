import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CalendarClock, Pencil, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { can } from "@/lib/permissions";
import { cn, fmtDate, fmtDateTime, isOverdue, relTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumbs, KeyValue, Panel } from "@/components/hq/record";
import { SopMarkdown } from "@/components/hq/sops/sop-markdown";
import { SopSteps } from "@/components/hq/sops/sop-steps";
import { SopAcknowledge } from "@/components/hq/sops/sop-acknowledge";
import { SopHistory } from "@/components/hq/sops/sop-history";
import { CATEGORY_TONE, appliesToLabel, categoryLabel, parseQuiz, parseSteps } from "@/components/hq/sops/constants";

export default async function SopPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const { slug } = await params;
  const sp = await searchParams;
  const canEdit = can(user, "sops.edit");
  const leadership = user.tier === "OWNER" || user.tier === "LEADERSHIP";
  const sop = await prisma.sop.findUnique({
    where: { slug },
    include: {
      department: { select: { id: true, name: true, color: true } },
      owner: { select: { id: true, name: true, image: true, avatarColor: true } },
      versions: { orderBy: { version: "desc" }, include: { changedBy: { select: { name: true } } } },
      acknowledgments: { orderBy: { acknowledgedAt: "desc" }, include: { user: { select: { id: true, name: true, image: true, avatarColor: true, department: { select: { name: true } } } } } },
    },
  });
  if (!sop) notFound();
  if (sop.status !== "PUBLISHED" && !canEdit) notFound();

  const steps = parseSteps(sop.steps);
  const quiz = parseQuiz(sop.quiz);
  const myAck = sop.acknowledgments.find((a) => a.userId === user.id && a.version === sop.version) ?? null;
  const currentAcks = sop.acknowledgments.filter((a) => a.version === sop.version);

  const [related, audience] = await Promise.all([
    prisma.sop.findMany({
      where: { id: { not: sop.id }, status: "PUBLISHED", OR: [...(sop.departmentId ? [{ departmentId: sop.departmentId }] : []), ...(sop.keywords.length ? [{ keywords: { hasSome: sop.keywords } }] : []), ...(sop.appliesTo.length ? [{ appliesTo: { hasSome: sop.appliesTo } }] : [])] },
      select: { id: true, slug: true, code: true, title: true, summary: true, category: true, keywords: true, departmentId: true, appliesTo: true, department: { select: { name: true, color: true } } },
      take: 24,
    }),
    leadership && sop.requiresAcknowledgment ? prisma.user.findMany({ where: { kind: "STAFF", status: "ACTIVE", ...(sop.scope === "DEPARTMENT" && sop.departmentId ? { departmentId: sop.departmentId } : {}) }, select: { id: true, name: true, image: true, avatarColor: true, department: { select: { name: true } } }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const relatedRanked = related
    .map((r) => ({ r, score: (r.departmentId && r.departmentId === sop.departmentId ? 1 : 0) + r.keywords.filter((k) => sop.keywords.includes(k)).length * 2 + r.appliesTo.filter((k) => sop.appliesTo.includes(k)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.r);
  const notYet = audience.filter((u) => !currentAcks.some((a) => a.userId === u.id));
  const reviewOverdue = isOverdue(sop.reviewDate);

  return (
    <div>
      <Breadcrumbs items={[{ label: "SOPs", href: "/hq/sops" }, ...(sop.department ? [{ label: sop.department.name, href: `/hq/sops?dept=${sop.department.id}` }] : []), { label: sop.code ?? sop.title }]} />

      <header className="mb-6 rounded-xl border border-line bg-surface p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              {sop.code ? <span className="font-mono font-semibold tracking-wide text-muted">{sop.code}</span> : null}
              <span className="flex items-center gap-1.5 text-muted">
                <span className="size-2 rounded-full" style={{ background: sop.department?.color ?? "#4F6D7A" }} /> {sop.department?.name ?? "Company wide"}
              </span>
              <Badge variant={CATEGORY_TONE[sop.category] ?? "default"}>{categoryLabel(sop.category)}</Badge>
              {sop.status !== "PUBLISHED" ? <StatusBadge value={sop.status} /> : null}
            </div>
            <h1 className="mt-2 max-w-[28ch] font-display text-[28px] font-bold leading-[1.15] text-ink md:text-[32px]">{sop.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
              <span className="flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-muted" /> Version {sop.version}
              </span>
              {sop.owner ? (
                <span className="flex items-center gap-1.5">
                  <Avatar name={sop.owner.name} src={sop.owner.image} color={sop.owner.avatarColor} size={18} /> {sop.owner.name}
                </span>
              ) : null}
              {sop.reviewDate ? (
                <span className={cn("flex items-center gap-1.5", reviewOverdue && "text-warn")}>
                  <CalendarClock className="size-3.5 text-muted" /> Review {reviewOverdue ? "was due" : "due"} {fmtDate(sop.reviewDate, { year: "numeric" })}
                </span>
              ) : null}
              <span className="text-muted">Updated {relTime(sop.updatedAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/assistant?type=sop&id=${sop.id}&label=${encodeURIComponent(sop.title)}`}>
                <Sparkles /> Ask about this
              </Link>
            </Button>
            {canEdit ? (
              <Button asChild size="sm">
                <Link href={`/hq/sops/${sop.slug}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Tabs defaultValue={sp.tab ?? "document"}>
            <TabsList>
              <TabsTrigger value="document">Document</TabsTrigger>
              <TabsTrigger value="history">
                History <span className="rounded bg-surface-2 px-1 text-[10px]">{sop.versions.length}</span>
              </TabsTrigger>
              {leadership ? (
                <TabsTrigger value="acks">
                  Acknowledgments <span className="rounded bg-surface-2 px-1 text-[10px]">{currentAcks.length}</span>
                </TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent value="document">
              <article className="mx-auto w-full max-w-[72ch]">
                {sop.summary ? (
                  <div className="mb-6 rounded-xl border-l-[3px] border-brand bg-brand-tint/40 px-5 py-4">
                    <div className="eyebrow mb-1 text-brand-deep dark:text-brand-bright">In short</div>
                    <p className="text-[15.5px] leading-relaxed text-ink">{sop.summary}</p>
                  </div>
                ) : null}
                <div className="rounded-xl border border-line bg-surface px-6 py-7 shadow-sm md:px-9 md:py-9">
                  <SopMarkdown body={sop.body} />
                </div>
                {steps.length ? (
                  <div className="mt-6">
                    <SopSteps steps={steps} />
                  </div>
                ) : null}
                {sop.enforcedBySystem ? (
                  <div className="mt-6 flex gap-3 rounded-xl border border-info/30 bg-info-soft/50 px-4 py-3">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
                    <div>
                      <div className="text-[13px] font-semibold text-info">Enforced by the system</div>
                      <p className="text-[13.5px] leading-relaxed text-ink-2">{sop.enforcedBySystem}</p>
                    </div>
                  </div>
                ) : null}
              </article>
            </TabsContent>
            <TabsContent value="history">
              <SopHistory currentVersion={sop.version} versions={sop.versions.map((v) => ({ id: v.id, version: v.version, title: v.title, body: v.body, steps: parseSteps(v.steps), changeNote: v.changeNote, changedBy: v.changedBy?.name ?? null, createdAt: v.createdAt.toISOString() }))} />
            </TabsContent>
            {leadership ? (
              <TabsContent value="acks">
                {!sop.requiresAcknowledgment ? (
                  <p className="text-sm text-muted">This SOP does not require acknowledgment. Turn it on in the editor if people must confirm they read it.</p>
                ) : (
                  <div className="flex flex-col gap-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MiniStat label="Acknowledged v" value={`${currentAcks.length}`} sub={`of ${audience.length} in scope`} tone="ok" />
                      <MiniStat label="Still to read" value={`${notYet.length}`} sub={notYet.length ? "Nudge them from Team" : "Everyone is current"} tone={notYet.length ? "warn" : "default"} />
                      <MiniStat label="Older versions" value={`${sop.acknowledgments.length - currentAcks.length}`} sub="acknowledgments on past versions" />
                    </div>
                    {notYet.length ? (
                      <Panel title="Not yet acknowledged">
                        <ul className="flex flex-wrap gap-2">
                          {notYet.map((u) => (
                            <li key={u.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 py-1 pl-1 pr-2.5 text-xs">
                              <Avatar name={u.name} src={u.image} color={u.avatarColor} size={18} /> {u.name}
                            </li>
                          ))}
                        </ul>
                      </Panel>
                    ) : null}
                    {sop.acknowledgments.length === 0 ? (
                      <p className="text-sm text-muted">Nobody has acknowledged this SOP yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Person</TableHead>
                            <TableHead>Department</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Quiz</TableHead>
                            <TableHead>When</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sop.acknowledgments.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell>
                                <span className="flex items-center gap-2 font-medium">
                                  <Avatar name={a.user.name} src={a.user.image} color={a.user.avatarColor} size={22} /> {a.user.name}
                                </span>
                              </TableCell>
                              <TableCell className="text-ink-2">{a.user.department?.name ?? <span className="text-faint">None</span>}</TableCell>
                              <TableCell>
                                v{a.version} {a.version === sop.version ? <Badge variant="ok">Current</Badge> : <Badge>Old</Badge>}
                              </TableCell>
                              <TableCell className="tabular">{a.quizScore === null ? <span className="text-faint">No quiz</span> : `${a.quizScore}%`}</TableCell>
                              <TableCell className="text-xs text-muted">{fmtDateTime(a.acknowledgedAt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </TabsContent>
            ) : null}
          </Tabs>
        </div>

        <aside className="flex flex-col gap-4">
          {sop.requiresAcknowledgment && sop.status === "PUBLISHED" ? <SopAcknowledge sopId={sop.id} version={sop.version} acknowledgedAt={myAck?.acknowledgedAt.toISOString() ?? null} quiz={quiz} /> : null}
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Department", value: sop.department?.name ?? "Company wide" },
                { label: "Category", value: categoryLabel(sop.category) },
                { label: "Scope", value: sop.scope === "COMPANY" ? "Everyone" : "One department" },
                { label: "Owner", value: sop.owner ? <span className="flex items-center gap-1.5"><UserRound className="size-3.5 text-muted" /> {sop.owner.name}</span> : null },
                { label: "Version", value: `v${sop.version}` },
                { label: "Published", value: sop.publishedAt ? fmtDate(sop.publishedAt, { year: "numeric" }) : null },
                { label: "Review date", value: sop.reviewDate ? fmtDate(sop.reviewDate, { year: "numeric" }) : null },
                { label: "Source", value: sop.source },
                { label: "Tags", value: sop.tags.length ? <span className="flex flex-wrap gap-1">{sop.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null },
              ]}
            />
          </Panel>
          {sop.appliesTo.length ? (
            <Panel title="Applies to">
              <div className="flex flex-wrap gap-1.5">
                {sop.appliesTo.map((a) => (
                  <Badge key={a} variant="outline" className="font-medium">
                    {appliesToLabel(a)}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] text-muted">This SOP shows in the help drawer on those screens and tasks.</p>
            </Panel>
          ) : null}
          {relatedRanked.length ? (
            <Panel title="Related SOPs" padded={false}>
              <ul className="divide-y divide-line">
                {relatedRanked.map((r) => (
                  <li key={r.id}>
                    <Link href={`/hq/sops/${r.slug}`} className="block px-4 py-2.5 hover:bg-surface-2/70">
                      <div className="flex items-center gap-2 text-[11px] text-muted">
                        {r.code ? <span className="font-mono font-semibold">{r.code}</span> : null}
                        <span className="flex items-center gap-1">
                          <span className="size-1.5 rounded-full" style={{ background: r.department?.color ?? "#4F6D7A" }} /> {r.department?.name ?? "Company"}
                        </span>
                      </div>
                      <div className="text-[13.5px] font-medium text-ink">{r.title}</div>
                      {r.summary ? <div className="line-clamp-2 text-xs text-muted">{r.summary}</div> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1.5 font-display text-2xl font-bold leading-none tabular", { default: "text-ink", ok: "text-ok", warn: "text-warn" }[tone])}>{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
