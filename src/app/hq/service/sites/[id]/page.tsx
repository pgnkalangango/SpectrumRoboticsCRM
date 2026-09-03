import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Pencil, Plus, Bot, LifeBuoy, Wifi, BookOpen, ExternalLink, Award, FileText, Sparkles, CheckSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { getTimeline } from "@/lib/timeline";
import { fmtDate, fullName, label, relTime } from "@/lib/utils";
import { isWithinDays, OWNERSHIP_LABELS, robotLabel, renewalAlertDays, toDateInput, defaultMaintenanceInterval } from "@/lib/service";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Breadcrumbs, KeyValue, Panel, RecordHeader } from "@/components/hq/record";
import { Timeline } from "@/components/hq/timeline";
import { SiteSheetFromUrl } from "@/components/hq/service/site-form";
import { RobotSheetFromUrl } from "@/components/hq/service/robot-form";
import { InstallChecklist, type InstallProject } from "@/components/hq/service/install-checklist";
import { IssueCertificateButton, AddDocumentButton, DeleteDocumentButton } from "@/components/hq/service/site-dialogs";
import { SlaBadge } from "@/components/hq/service/sla-badge";

export default async function SitePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.site.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true, status: true } },
      primaryContact: { select: { id: true, firstName: true, lastName: true, email: true, phoneMobile: true, jobTitle: true } },
      accountManager: { select: { id: true, name: true, image: true, avatarColor: true } },
      technician: { select: { id: true, name: true, image: true, avatarColor: true } },
      robots: { orderBy: [{ status: "asc" }, { serialNumber: "asc" }] },
      tickets: { orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 50, include: { assignee: { select: { name: true } }, robotUnit: { select: { serialNumber: true, modelName: true } } } },
      certificates: { orderBy: { issuedAt: "desc" }, include: { issuedBy: { select: { name: true } } } },
      documents: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { name: true } } } },
      tasks: { where: { status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } }, orderBy: [{ dueAt: "asc" }], take: 10 },
    },
  });
  if (!s) notFound();
  const [timeline, projects, alertDays, interval] = await Promise.all([
    getTimeline({ OR: [{ siteId: id }, { companyId: s.companyId, siteId: null, ticketId: null }] }),
    prisma.project.findMany({ where: { type: "install", OR: [{ siteId: id }, { siteId: null, companyId: s.companyId }] }, orderBy: { createdAt: "desc" }, include: { owner: { select: { name: true } } } }),
    renewalAlertDays(),
    defaultMaintenanceInterval(),
  ]);
  const openTickets = s.tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status));
  const address = [s.addressStreet, [s.addressCity, s.addressState].filter(Boolean).join(", "), s.addressZip].filter(Boolean).join(", ");
  const robotModels = Array.from(new Set(s.robots.map((r) => r.modelName ?? r.oem).filter((m): m is string => !!m)));
  const now = new Date().getTime();

  return (
    <div>
      <Breadcrumbs items={[{ label: "Sites", href: "/hq/service/sites" }, { label: s.name }]} />
      <RecordHeader
        avatar={
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-deep dark:text-brand-bright">
            <MapPin className="size-6" />
          </div>
        }
        title={s.name}
        badges={
          <>
            <StatusBadge value={s.status} />
            <Badge>{label(s.siteType)}</Badge>
          </>
        }
        subtitle={
          <>
            <Link href={`/hq/companies/${s.company.id}`} className="hover:text-brand">
              {s.company.name}
            </Link>
            {address ? ` · ${address}` : ""}
          </>
        }
        meta={
          <>
            <span className="flex items-center gap-1"><Bot className="size-3.5" /> {s.robots.length} robot{s.robots.length === 1 ? "" : "s"}</span>
            <span className="flex items-center gap-1"><LifeBuoy className="size-3.5" /> {openTickets.length} open ticket{openTickets.length === 1 ? "" : "s"}</span>
            {s.goLiveDate ? <span>Live since {fmtDate(s.goLiveDate)}</span> : s.surveyDate ? <span>Survey {fmtDate(s.surveyDate)}</span> : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/assistant?type=site&id=${s.id}&label=${encodeURIComponent(s.name)}`}>
                <Sparkles /> Ask assistant
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/tasks?new=1&siteId=${s.id}&companyId=${s.company.id}&companyName=${encodeURIComponent(s.company.name)}`}>
                <CheckSquare /> Task
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/hq/service/tickets?new=1&siteId=${s.id}&siteName=${encodeURIComponent(s.name)}&companyId=${s.company.id}&companyName=${encodeURIComponent(s.company.name)}`}>
                <LifeBuoy /> Ticket
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/hq/service/sites/${s.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <KeyValue
              items={[
                { label: "Company", value: <Link href={`/hq/companies/${s.company.id}`} className="text-brand hover:underline">{s.company.name}</Link> },
                { label: "Address", value: address },
                { label: "Size", value: [s.sqFootage ? `${s.sqFootage.toLocaleString()} sq ft` : null, s.floors ? `${s.floors} floor${s.floors === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ") },
                { label: "Survey date", value: s.surveyDate ? fmtDate(s.surveyDate) : null },
                { label: "Go live date", value: s.goLiveDate ? fmtDate(s.goLiveDate) : null },
                { label: "Added", value: fmtDate(s.createdAt) },
              ]}
            />
          </Panel>
          <Panel title="People">
            <KeyValue
              items={[
                { label: "Primary contact", value: s.primaryContact ? <span><Link href={`/hq/contacts/${s.primaryContact.id}`} className="text-brand hover:underline">{fullName(s.primaryContact)}</Link>{s.primaryContact.jobTitle ? <span className="block text-xs text-muted">{s.primaryContact.jobTitle}</span> : null}{s.primaryContact.phoneMobile ? <span className="block text-xs text-muted">{s.primaryContact.phoneMobile}</span> : null}</span> : null },
                { label: "Account manager", value: s.accountManager ? <span className="flex items-center gap-1.5"><Avatar name={s.accountManager.name} src={s.accountManager.image} color={s.accountManager.avatarColor} size={18} /> {s.accountManager.name}</span> : null },
                { label: "Technician", value: s.technician ? <span className="flex items-center gap-1.5"><Avatar name={s.technician.name} src={s.technician.image} color={s.technician.avatarColor} size={18} /> {s.technician.name}</span> : null },
              ]}
            />
          </Panel>
          {s.wifiNotes ? (
            <Panel title={<span className="flex items-center gap-1.5"><Wifi className="size-3.5" /> Wi-Fi</span>}>
              <p className="whitespace-pre-wrap text-sm text-ink-2">{s.wifiNotes}</p>
            </Panel>
          ) : null}
          {s.notes ? (
            <Panel title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-2">{s.notes}</p>
            </Panel>
          ) : null}
          <Panel title="Procedures">
            <ul className="flex flex-col gap-1.5 text-sm">
              {[
                { slug: "service-site-survey", title: "Site survey" },
                { slug: "delivery-install-and-training", title: "Delivery, install and training" },
                { slug: "service-preventive-maintenance", title: "Preventive maintenance" },
                { slug: "service-ticket-handling-and-sla", title: "Ticket handling and SLA" },
              ].map((p) => (
                <li key={p.slug}>
                  <Link href={`/hq/sops/${p.slug}`} className="flex items-center gap-1.5 text-ink-2 hover:text-brand">
                    <BookOpen className="size-3.5 text-muted" /> {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Tabs defaultValue={sp.tab ?? "timeline"}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="robots">
              Robots <span className="rounded bg-surface-2 px-1 text-[10px]">{s.robots.length}</span>
            </TabsTrigger>
            <TabsTrigger value="tickets">
              Tickets <span className="rounded bg-surface-2 px-1 text-[10px]">{openTickets.length}</span>
            </TabsTrigger>
            <TabsTrigger value="install">Install project</TabsTrigger>
            <TabsTrigger value="training">
              Training <span className="rounded bg-surface-2 px-1 text-[10px]">{s.certificates.length}</span>
            </TabsTrigger>
            <TabsTrigger value="documents">
              Documents <span className="rounded bg-surface-2 px-1 text-[10px]">{s.documents.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <Timeline items={timeline} context={{ siteId: s.id, companyId: s.company.id, contactId: s.primaryContact?.id ?? null }} currentUserId={user.id} canDeleteAny={user.tier !== "EMPLOYEE"} />
          </TabsContent>

          <TabsContent value="robots">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted">Units deployed or reserved for this site.</p>
              <Button asChild size="sm">
                <Link href={`/hq/service/sites/${s.id}?newRobot=1&tab=robots`}>
                  <Plus /> Add robot
                </Link>
              </Button>
            </div>
            {s.robots.length === 0 ? (
              <EmptyState compact icon={Bot} title="No robots at this site yet" body="Add each unit as it is assigned. Serial numbers drive maintenance and support." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Robot</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ownership</TableHead>
                    <TableHead>Installed</TableHead>
                    <TableHead>Next maintenance</TableHead>
                    <TableHead>RaaS ends</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.robots.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/hq/service/robots/${r.id}`} className="font-medium hover:text-brand">
                          {r.modelName ?? r.oem ?? "Robot"}
                        </Link>
                        <span className="block font-mono text-xs text-muted">{r.serialNumber}</span>
                      </TableCell>
                      <TableCell><StatusBadge value={r.status} /></TableCell>
                      <TableCell className="text-ink-2">{OWNERSHIP_LABELS[r.ownership]}</TableCell>
                      <TableCell className="text-ink-2">{r.installDate ? fmtDate(r.installDate) : <span className="text-faint">Not yet</span>}</TableCell>
                      <TableCell>{r.nextMaintenance ? <span className={r.nextMaintenance.getTime() < now ? "font-semibold text-bad" : isWithinDays(r.nextMaintenance, 14) ? "font-semibold text-warn" : "text-ink-2"}>{fmtDate(r.nextMaintenance)}</span> : <span className="text-faint">Not scheduled</span>}</TableCell>
                      <TableCell>{r.raasTermEnd ? <span className={isWithinDays(r.raasTermEnd, alertDays) ? "font-semibold text-warn" : "text-ink-2"}>{fmtDate(r.raasTermEnd)}</span> : <span className="text-faint">n/a</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="tickets">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted">Support tickets for this site, open ones first.</p>
              <Button asChild size="sm">
                <Link href={`/hq/service/tickets?new=1&siteId=${s.id}&siteName=${encodeURIComponent(s.name)}&companyId=${s.company.id}&companyName=${encodeURIComponent(s.company.name)}`}>
                  <Plus /> New ticket
                </Link>
              </Button>
            </div>
            {s.tickets.length === 0 ? (
              <EmptyState compact icon={LifeBuoy} title="No tickets for this site" body="That is good news. Tickets opened here or from the client portal will show up in this list." />
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {s.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/hq/service/tickets/${t.id}`} className="font-medium hover:text-brand">
                        {t.number} · {t.subject}
                      </Link>
                      <div className="text-xs text-muted">
                        {t.robotUnit ? `${robotLabel(t.robotUnit)} · ` : ""}
                        {t.assignee?.name ?? "Unassigned"} · updated {relTime(t.updatedAt)}
                      </div>
                    </div>
                    <SlaBadge slaDueAt={t.slaDueAt} status={t.status} firstResponseAt={t.firstResponseAt} resolvedAt={t.resolvedAt} />
                    <StatusBadge value={t.priority} />
                    <StatusBadge value={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="install">
            {projects.length === 0 ? (
              <EmptyState compact icon={CheckSquare} title="No install project yet" body="An install project is created automatically when a deal is won or a quote is accepted. Its stages are tracked here; when the last one is done the site goes live." action={<Button asChild variant="secondary" size="sm"><Link href="/hq/sops/delivery-install-and-training"><BookOpen /> Read the install SOP</Link></Button>} />
            ) : (
              <div className="flex flex-col gap-4">
                {projects.map((p) => {
                  const proj: InstallProject = { id: p.id, name: p.name, status: p.status, ownerName: p.owner?.name ?? null, dealId: p.dealId, siteId: p.siteId, stages: ((p.stages as { key: string; title: string; done: boolean }[] | null) ?? []) };
                  return <InstallChecklist key={p.id} project={proj} siteId={s.id} />;
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="training">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Operators certified at this site. Certificates show in the client portal and expire after a year.</p>
              <IssueCertificateButton siteId={s.id} robotModels={robotModels} />
            </div>
            {s.certificates.length === 0 ? (
              <EmptyState compact icon={Award} title="Nobody certified yet" body="Issue a certificate after each training session so the customer has proof and you know who to call on site." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Trainee</TableHead>
                    <TableHead>Robot</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.certificates.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.certificateNumber}</TableCell>
                      <TableCell>
                        <span className="font-medium">{c.traineeName}</span>
                        {c.traineeEmail ? <span className="block text-xs text-muted">{c.traineeEmail}</span> : null}
                      </TableCell>
                      <TableCell className="text-ink-2">{c.robotModel ?? <span className="text-faint">Any</span>}</TableCell>
                      <TableCell className="text-right tabular">{c.score !== null ? `${c.score}%` : <span className="text-faint">n/a</span>}</TableCell>
                      <TableCell className="text-ink-2">{fmtDate(c.issuedAt)}{c.issuedBy ? <span className="block text-xs text-muted">by {c.issuedBy.name}</span> : null}</TableCell>
                      <TableCell>{c.expiresAt ? <span className={c.expiresAt.getTime() < now ? "font-semibold text-bad" : isWithinDays(c.expiresAt, alertDays) ? "font-semibold text-warn" : "text-ink-2"}>{fmtDate(c.expiresAt)}</span> : <span className="text-faint">Never</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="documents">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted">Survey reports, floor plans, contracts and manuals for this site.</p>
              <AddDocumentButton siteId={s.id} />
            </div>
            {s.documents.length === 0 ? (
              <EmptyState compact icon={FileText} title="No documents yet" body="Add links to the survey report, floor plan and signed paperwork so anyone on the team can find them." />
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {s.documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText className="size-4 text-muted" />
                    <div className="min-w-0 flex-1">
                      <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm font-medium hover:text-brand">
                        {d.name} <ExternalLink className="size-3 text-muted" />
                      </a>
                      <div className="text-xs text-muted">
                        {label(d.category)} · {fmtDate(d.createdAt)}
                        {d.uploadedBy ? ` · ${d.uploadedBy.name}` : ""}
                      </div>
                    </div>
                    {d.clientVisible ? <Badge variant="brand">Client can see</Badge> : <Badge>Internal</Badge>}
                    <DeleteDocumentButton id={d.id} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <SiteSheetFromUrl
        initial={{
          id: s.id,
          name: s.name,
          addressStreet: s.addressStreet,
          addressCity: s.addressCity,
          addressState: s.addressState,
          addressZip: s.addressZip,
          siteType: s.siteType,
          sqFootage: s.sqFootage,
          floors: s.floors,
          wifiNotes: s.wifiNotes,
          status: s.status,
          surveyDate: toDateInput(s.surveyDate),
          goLiveDate: toDateInput(s.goLiveDate),
          notes: s.notes,
          company: { id: s.company.id, label: s.company.name },
          primaryContact: s.primaryContact ? { id: s.primaryContact.id, label: fullName(s.primaryContact) } : null,
          accountManager: s.accountManager ? { id: s.accountManager.id, label: s.accountManager.name } : null,
          technician: s.technician ? { id: s.technician.id, label: s.technician.name } : null,
        }}
      />
      <RobotSheetFromUrl param="newRobot" defaultCompany={{ id: s.company.id, label: s.company.name }} defaultSite={{ id: s.id, label: s.name }} defaultInterval={interval} />
    </div>
  );
}
