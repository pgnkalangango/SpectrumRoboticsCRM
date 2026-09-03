"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, BellRing, Building2, Check, EyeOff, Mail, Phone, RefreshCw, Search, Sparkles, UserPlus, Undo2, Briefcase, ExternalLink, Clock, Flame, MoonStar, Reply, Hourglass } from "lucide-react";
import { cn, fmtDate, relTime } from "@/lib/utils";
import type { FollowUp, FollowUpSet } from "@/lib/mail/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { addPeopleToCrm, addPersonToCrm, ignorePeople, improvePeopleDetails, refreshPeople, remindMe, setPersonStatus } from "@/server/actions/people";

export type Person = {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  company: string | null;
  companyId: string | null;
  jobTitle: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  domain: string | null;
  messagesIn: number;
  messagesOut: number;
  threads: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastSubject: string | null;
  lastThreadId: string | null;
  score: number;
  status: "NEW" | "ADDED" | "IGNORED";
  contactId: string | null;
  signature: string | null;
};

const TYPES = [
  { value: "LEAD", label: "Lead" },
  { value: "PROSPECT", label: "Prospect" },
  { value: "CLIENT", label: "Client" },
  { value: "PARTNER", label: "Partner" },
  { value: "VENDOR", label: "Vendor" },
  { value: "OTHER", label: "Other" },
];

export function PeopleView({ people, followUps, initialTab, discoveredAt, assistantOn }: { people: Person[]; followUps: FollowUpSet; initialTab: string; discoveredAt: string | null; assistantOn: boolean }) {
  const router = useRouter();
  const [tab, setTab] = React.useState(initialTab);
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Person | null>(null);
  const [refreshing, startRefresh] = React.useTransition();

  React.useEffect(() => {
    if (!discoveredAt) startRefresh(async () => {
      const r = await refreshPeople({ sync: true });
      if (r.ok && r.data) { toast.success(`Found ${r.data.people} people in your mailbox.`); router.refresh(); } else if (!r.ok) toast.error(r.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fresh = people.filter((p) => p.status === "NEW");
  const inCrm = people.filter((p) => p.status === "ADDED");
  const hidden = people.filter((p) => p.status === "IGNORED");
  const followCount = followUps.needsReply.length + followUps.waitingOnThem.length + followUps.goneQuiet.length;
  const match = (p: Person) => !q || `${p.name} ${p.email} ${p.company ?? ""} ${p.jobTitle ?? ""}`.toLowerCase().includes(q.toLowerCase());

  const refresh = () => startRefresh(async () => {
    const r = await refreshPeople({ sync: true });
    if (r.ok && r.data) { toast.success(`Synced ${r.data.synced} messages. ${r.data.newPeople} new ${r.data.newPeople === 1 ? "person" : "people"}, ${r.data.enriched} with details read from signatures.`); router.refresh(); } else if (!r.ok) toast.error(r.error);
  });
  const improve = async () => {
    setBusy("improve");
    const r = await improvePeopleDetails();
    setBusy(null);
    if (r.ok && r.data) { toast.success(r.data.updated ? `Filled in details for ${r.data.updated} ${r.data.updated === 1 ? "person" : "people"}.` : "Nothing new to fill in."); router.refresh(); } else if (!r.ok) toast.error(r.error);
  };
  const addOne = async (p: Person) => {
    setBusy(p.id);
    const r = await addPersonToCrm({ id: p.id });
    setBusy(null);
    if (r.ok && r.data) { toast.success(r.data.created ? `${p.name} added to contacts.` : `${p.name} was already a contact. Linked.`); router.refresh(); } else if (!r.ok) toast.error(r.error);
  };
  const addSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy("bulk");
    const r = await addPeopleToCrm(ids);
    setBusy(null);
    if (r.ok && r.data) { toast.success(`${r.data.added} added, ${r.data.linked} linked to existing contacts.`); setSelected(new Set()); router.refresh(); } else if (!r.ok) toast.error(r.error);
  };
  const hideSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy("bulk");
    const r = await ignorePeople(ids);
    setBusy(null);
    if (r.ok) { toast.success(`Hid ${r.data?.count ?? ids.length}.`); setSelected(new Set()); router.refresh(); } else toast.error(r.error);
  };
  const hideOne = async (p: Person, status: "IGNORED" | "NEW") => {
    setBusy(p.id);
    const r = await setPersonStatus(p.id, status);
    setBusy(null);
    if (r.ok) router.refresh(); else toast.error(r.error);
  };
  const remind = async (items: FollowUp[]) => {
    setBusy("remind");
    const r = await remindMe(items);
    setBusy(null);
    if (r.ok && r.data) { toast.success(r.data.created ? `${r.data.created} reminder${r.data.created === 1 ? "" : "s"} added to your tasks.` : "You already have reminders for these."); router.refresh(); } else if (!r.ok) toast.error(r.error);
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="People found" value={people.length - hidden.length} sub={discoveredAt ? `Updated ${relTime(discoveredAt)}` : "Reading your mailbox"} />
        <Stat label="Not in the CRM yet" value={fresh.length} sub={`${followUps.quietLeads.length} look like leads`} tone={followUps.quietLeads.length ? "brand" : "default"} />
        <Stat label="Need a follow up" value={followCount} sub={`${followUps.needsReply.length} waiting on your reply`} tone={followUps.needsReply.length ? "warn" : "default"} />
        <Stat label="In the CRM" value={inCrm.length} sub="Touch dates kept up to date from mail" tone="ok" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, company or title" className="pl-9" />
        </div>
        {assistantOn ? (
          <Tooltip content="Sends unread signature blocks to the assistant to fill in title, company and phone. Nothing is sent to anyone.">
            <Button variant="outline" onClick={improve} disabled={busy === "improve"}><Sparkles /> Fill in details</Button>
          </Tooltip>
        ) : null}
        <Button variant="outline" onClick={refresh} disabled={refreshing}><RefreshCw className={cn(refreshing && "animate-spin")} /> {refreshing ? "Reading mailbox" : "Refresh"}</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="new">Not in CRM <Count n={fresh.length} /></TabsTrigger>
          <TabsTrigger value="follow">Follow ups <Count n={followCount} tone={followUps.needsReply.length ? "warn" : undefined} /></TabsTrigger>
          <TabsTrigger value="leads">Possible leads <Count n={followUps.quietLeads.length} tone={followUps.quietLeads.length ? "brand" : undefined} /></TabsTrigger>
          <TabsTrigger value="crm">In CRM <Count n={inCrm.length} /></TabsTrigger>
          <TabsTrigger value="hidden">Hidden <Count n={hidden.length} /></TabsTrigger>
        </TabsList>

        <TabsContent value="new">
          {fresh.length ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                <Checkbox checked={selected.size > 0 && fresh.filter(match).every((p) => selected.has(p.id))} onCheckedChange={(v) => setSelected(v ? new Set(fresh.filter(match).map((p) => p.id)) : new Set())} aria-label="Select all" />
                <span>{selected.size ? `${selected.size} selected` : "Select people to add them all at once"}</span>
                {selected.size ? (
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" onClick={addSelected} disabled={busy === "bulk"}><UserPlus /> Add {selected.size} to contacts</Button>
                    <Button size="sm" variant="outline" onClick={hideSelected} disabled={busy === "bulk"}><EyeOff /> Hide</Button>
                  </span>
                ) : null}
              </div>
              <PeopleList people={fresh.filter(match)} selectable selected={selected} onToggle={toggle} busy={busy} render={(p) => (
                <>
                  <Button size="sm" onClick={() => addOne(p)} disabled={busy === p.id}><UserPlus /> Add to contacts</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Review details</Button>
                  <Button size="sm" variant="ghost" onClick={() => hideOne(p, "IGNORED")} disabled={busy === p.id} aria-label="Hide"><EyeOff /></Button>
                </>
              )} />
            </>
          ) : (
            <EmptyState icon={Mail} title={discoveredAt ? "Everyone you talk to is already in the CRM" : "Reading your mailbox"} body={discoveredAt ? "New people show up here as mail comes in. Automated senders and teammates are filtered out." : "The first pass reads your mail history and can take a minute."} />
          )}
        </TabsContent>

        <TabsContent value="follow">
          <div className="space-y-6">
            <FollowGroup icon={Reply} tone="warn" title="Waiting on your reply" hint={`They wrote at least ${followUps.settings.replyWithinDays} day${followUps.settings.replyWithinDays === 1 ? "" : "s"} ago and have not heard back.`} items={followUps.needsReply} busy={busy} onRemind={remind} />
            <FollowGroup icon={Hourglass} tone="info" title="No reply to you yet" hint={`You wrote at least ${followUps.settings.waitingOnThemDays} days ago. A nudge usually helps.`} items={followUps.waitingOnThem} busy={busy} onRemind={remind} />
            <FollowGroup icon={MoonStar} tone="default" title="Gone quiet" hint={`People in the CRM you used to talk with, silent for ${followUps.settings.quietDays}+ days.`} items={followUps.goneQuiet} busy={busy} onRemind={remind} />
            {!followCount ? <EmptyState icon={Check} title="Nothing waiting on you" body="Every conversation has been answered and nobody has gone quiet. Change the thresholds under Settings, Follow ups." /> : null}
          </div>
        </TabsContent>

        <TabsContent value="leads">
          <div className="mb-3 rounded-xl border border-brand/30 bg-brand-tint/40 px-4 py-3 text-sm text-ink-2">
            <Flame className="mr-1.5 inline size-4 text-brand" />
            People at business domains you have exchanged real mail with, who are not in the CRM. Add them as leads or set a reminder to reach out.
          </div>
          <FollowGroup icon={Flame} tone="brand" title="" hint="" items={followUps.quietLeads} busy={busy} onRemind={remind} extra={(f) => {
            const p = people.find((x) => x.id === f.mailContactId);
            return p ? <Button size="sm" onClick={() => addOne(p)} disabled={busy === p.id}><UserPlus /> Add as lead</Button> : null;
          }} />
          {!followUps.quietLeads.length ? <EmptyState icon={Flame} title="No hidden leads right now" body={`A person counts once you have had ${followUps.settings.leadMinExchanges} two way exchange${followUps.settings.leadMinExchanges === 1 ? "" : "s"} and they are not in the CRM. Lower the bar under Settings, Follow ups.`} /> : null}
        </TabsContent>

        <TabsContent value="crm">
          <PeopleList people={inCrm.filter(match)} busy={busy} render={(p) => (
            <>
              {p.contactId ? <Button size="sm" variant="outline" asChild><Link href={`/hq/contacts/${p.contactId}`}>Open contact</Link></Button> : null}
              <Button size="sm" variant="ghost" asChild><Link href={`/hq/assistant?q=${encodeURIComponent(`Summarize my recent conversations with ${p.name} (${p.email}) and suggest a next step.`)}`}><Sparkles /> Ask assistant</Link></Button>
            </>
          )} />
        </TabsContent>

        <TabsContent value="hidden">
          {hidden.length ? <PeopleList people={hidden.filter(match)} busy={busy} render={(p) => <Button size="sm" variant="outline" onClick={() => hideOne(p, "NEW")} disabled={busy === p.id}><Undo2 /> Bring back</Button>} /> : <EmptyState icon={EyeOff} title="Nothing hidden" body="People you hide from the list end up here." compact />}
        </TabsContent>
      </Tabs>

      <ReviewDialog person={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
    </div>
  );
}

function Count({ n, tone }: { n: number; tone?: "warn" | "brand" }) {
  return <span className={cn("ml-1.5 rounded-full px-1.5 text-[11px] font-semibold", tone === "warn" ? "bg-warn-soft text-warn" : tone === "brand" ? "bg-brand-tint text-brand-deep" : "bg-surface-2 text-muted")}>{n}</span>;
}

function PeopleList({ people, render, selectable, selected, onToggle, busy }: { people: Person[]; render: (p: Person) => React.ReactNode; selectable?: boolean; selected?: Set<string>; onToggle?: (id: string) => void; busy: string | null }) {
  if (!people.length) return <p className="py-8 text-center text-sm text-muted">Nobody matches.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      {people.map((p) => (
        <li key={p.id} className={cn("flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center", busy === p.id && "opacity-60")}>
          {selectable ? <Checkbox checked={selected?.has(p.id) ?? false} onCheckedChange={() => onToggle?.(p.id)} aria-label={`Select ${p.name}`} /> : null}
          <Avatar name={p.name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-ink">{p.name}</span>
              {p.jobTitle ? <span className="text-sm text-muted"><Briefcase className="mr-1 inline size-3.5" />{p.jobTitle}</span> : null}
              {p.company ? <span className="text-sm text-muted"><Building2 className="mr-1 inline size-3.5" />{p.companyId ? <Link href={`/hq/companies/${p.companyId}`} className="hover:underline">{p.company}</Link> : p.company}</span> : null}
              <ScoreBadge score={p.score} />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
              <span className="truncate">{p.email}</span>
              {p.phone ? <span><Phone className="mr-1 inline size-3" />{p.phone}</span> : null}
              {p.linkedinUrl ? <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">LinkedIn <ExternalLink className="inline size-3" /></a> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
              <Tooltip content="Messages they sent you"><span><ArrowDownLeft className="inline size-3" /> {p.messagesIn}</span></Tooltip>
              <Tooltip content="Messages you sent them"><span><ArrowUpRight className="inline size-3" /> {p.messagesOut}</span></Tooltip>
              <span>{p.threads} conversation{p.threads === 1 ? "" : "s"}</span>
              {p.lastSeenAt ? <span><Clock className="inline size-3" /> last {relTime(p.lastSeenAt)}</span> : null}
              {p.firstSeenAt ? <span>since {fmtDate(p.firstSeenAt)}</span> : null}
              {p.lastSubject ? <span className="truncate italic">&ldquo;{p.lastSubject}&rdquo;</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">{render(p)}</div>
        </li>
      ))}
    </ul>
  );
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 70) return <Badge variant="brand">Strong relationship</Badge>;
  if (score >= 40) return <Badge variant="info">Active</Badge>;
  return null;
}

function FollowGroup({ icon: Icon, tone, title, hint, items, busy, onRemind, extra }: { icon: React.ComponentType<{ className?: string }>; tone: "warn" | "info" | "default" | "brand"; title: string; hint: string; items: FollowUp[]; busy: string | null; onRemind: (items: FollowUp[]) => void; extra?: (f: FollowUp) => React.ReactNode }) {
  if (!items.length && !title) return null;
  if (!items.length) return null;
  const pending = items.filter((i) => !i.taskId);
  const tones = { warn: "text-warn", info: "text-info", default: "text-muted", brand: "text-brand" };
  return (
    <section>
      {title ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Icon className={cn("size-4", tones[tone])} />
          <h3 className="font-semibold text-ink">{title}</h3>
          <span className="text-xs text-muted">{items.length}</span>
          <span className="text-xs text-muted">{hint}</span>
          {pending.length > 1 ? <Button size="sm" variant="outline" className="ml-auto" onClick={() => onRemind(pending)} disabled={busy === "remind"}><BellRing /> Remind me about all {pending.length}</Button> : null}
        </div>
      ) : null}
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {items.map((f) => (
          <li key={f.key} className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center">
            <Avatar name={f.name} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold text-ink">{f.contactId ? <Link href={`/hq/contacts/${f.contactId}`} className="hover:underline">{f.name}</Link> : f.name}</span>
                {f.jobTitle ? <span className="text-sm text-muted">{f.jobTitle}</span> : null}
                {f.company ? <span className="text-sm text-muted">at {f.company}</span> : null}
                {f.taskId ? <Badge variant="ok"><Check className="size-3" /> Reminder set</Badge> : null}
              </div>
              <div className="mt-0.5 text-sm text-ink-2">{f.reason}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                {f.subject ? <span className="truncate italic">&ldquo;{f.subject}&rdquo;</span> : null}
                <span>{fmtDate(f.lastAt)}</span>
                <span>{f.email}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {extra?.(f)}
              {f.taskId ? <Button size="sm" variant="ghost" asChild><Link href="/hq/tasks">Open task</Link></Button> : <Button size="sm" variant="outline" onClick={() => onRemind([f])} disabled={busy === "remind"}><BellRing /> Remind me</Button>}
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/hq/assistant?q=${encodeURIComponent(f.kind === "needs_reply" ? `Draft a reply to ${f.name} (${f.email}) about "${f.subject ?? "our last conversation"}" in my voice.` : f.kind === "waiting_on_them" ? `Draft a short, friendly follow up to ${f.name} (${f.email}) about "${f.subject ?? "my last email"}". They have not replied in ${f.days} days.` : `Draft a warm check in email to ${f.name} (${f.email}). We last spoke ${f.days} days ago about "${f.subject ?? "working together"}".`)}`}>
                  <Sparkles /> Draft
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewDialog({ person, onClose, onSaved }: { person: Person | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState({ firstName: "", lastName: "", jobTitle: "", companyName: "", phone: "", type: "LEAD" });
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (person) setForm({ firstName: person.firstName || person.name.split(" ")[0] || "", lastName: person.lastName || person.name.split(" ").slice(1).join(" ") || "", jobTitle: person.jobTitle ?? "", companyName: person.company ?? "", phone: person.phone ?? "", type: "LEAD" });
  }, [person]);
  const save = async () => {
    if (!person) return;
    setSaving(true);
    const r = await addPersonToCrm({ id: person.id, firstName: form.firstName, lastName: form.lastName || null, jobTitle: form.jobTitle || null, companyName: form.companyName || null, phone: form.phone || null, type: form.type as "LEAD" });
    setSaving(false);
    if (r.ok) { toast.success(`${form.firstName} added to contacts.`); onSaved(); } else toast.error(r.error);
  };
  const field = (k: keyof typeof form, label: string, placeholder?: string) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink-2">{label}</span>
      <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={placeholder} />
    </label>
  );
  return (
    <Dialog open={!!person} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {person?.name} to contacts</DialogTitle>
          <DialogDescription>Check what was read from their emails, fix anything, then add them.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("firstName", "First name")}
            {field("lastName", "Last name")}
          </div>
          {field("jobTitle", "Job title", "Director of Operations")}
          {field("companyName", "Company", person?.domain ? `Guessed from ${person.domain}` : "")}
          {field("phone", "Phone", "(630) 555-0100")}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-2">Type</span>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {person?.signature ? (
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              <div className="eyebrow mb-1">From their signature</div>
              <pre className="whitespace-pre-wrap font-sans">{person.signature}</pre>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.firstName.trim()}><UserPlus /> Add to contacts</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
