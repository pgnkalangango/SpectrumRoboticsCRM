"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { GroupForm, type GroupSpec } from "@/components/hq/settings/group-form";
import { PipelineStagesForm, type StageRow } from "@/components/hq/settings/pipeline-stages-form";
import { DepartmentsForm, type DepartmentRow, type StaffOption } from "@/components/hq/settings/departments-form";
import { US_TIMEZONES } from "@/components/hq/me/profile-form";

export type SettingsValues = Record<string, Record<string, unknown>>;

const TABS: { key: string; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "quotes", label: "Quotes" },
  { key: "invoices", label: "Invoices" },
  { key: "tickets", label: "Tickets" },
  { key: "pipeline", label: "Pipeline" },
  { key: "pricingLanguage", label: "Pricing language" },
  { key: "email", label: "Email" },
  { key: "service", label: "Service" },
  { key: "assistant", label: "Assistant" },
  { key: "leads", label: "Leads" },
  { key: "followUp", label: "Follow ups" },
  { key: "social", label: "Social" },
  { key: "portal", label: "Portal" },
  { key: "departments", label: "Departments" },
];

function specs(staff: StaffOption[]): Record<string, GroupSpec> {
  return {
    company: {
      key: "company",
      title: "Company",
      intro: "Shown on quotes, invoices, emails and the client portal.",
      fields: [
        { name: "name", label: "Company name", type: "text" },
        { name: "legalName", label: "Legal name", type: "text", hint: "As it appears on contracts and invoices." },
        { name: "address", label: "Address", type: "text", full: true },
        { name: "phone", label: "Phone", type: "text" },
        { name: "email", label: "Main email", type: "text" },
        { name: "website", label: "Website", type: "text" },
        { name: "tagline", label: "Tagline", type: "text" },
        { name: "sendDomain", label: "Sending domain", type: "text", hint: "Domain for system email and outreach." },
        { name: "sendFromName", label: "From name", type: "text", hint: "What recipients see as the sender." },
        { name: "timezone", label: "Company time zone", type: "select", options: US_TIMEZONES },
      ],
    },
    quotes: {
      key: "quotes",
      title: "Quotes",
      intro: "Numbering, validity, tax and the terms printed on every quote.",
      fields: [
        { name: "prefix", label: "Number prefix", type: "text", hint: "Quotes look like SR-260101.", mono: true },
        { name: "counter", label: "Last number used", type: "readonly", hint: "Increments automatically. Not editable." },
        { name: "validityDays", label: "Valid for (days)", type: "number", min: 1, max: 365 },
        { name: "taxRate", label: "Default tax rate %", type: "number", step: "0.001", min: 0, max: 100 },
        { name: "discountPolicy", label: "Who may discount without approval", type: "select", options: [{ value: "owners_only", label: "Owners only" }, { value: "leadership", label: "Owners and leadership" }, { value: "anyone", label: "Anyone, within their approval limit" }] },
        { name: "defaultTerms", label: "Default terms", type: "textarea", rows: 4 },
        { name: "pdfFooter", label: "PDF footer", type: "textarea", rows: 2 },
      ],
    },
    invoices: {
      key: "invoices",
      title: "Invoices",
      intro: "Numbering and payment terms.",
      fields: [
        { name: "prefix", label: "Number prefix", type: "text", mono: true },
        { name: "counter", label: "Last number used", type: "readonly" },
        { name: "defaultTerms", label: "Default payment terms", type: "text", placeholder: "Net 30" },
        { name: "overdueGraceDays", label: "Grace days before overdue", type: "number", min: 0, max: 90, hint: "Days after the due date before an invoice is marked overdue and reminders start." },
      ],
    },
    tickets: {
      key: "tickets",
      title: "Tickets",
      intro: "Support ticket numbering.",
      fields: [
        { name: "prefix", label: "Number prefix", type: "text", mono: true, hint: "Tickets look like T-1001." },
        { name: "counter", label: "Last number used", type: "readonly" },
      ],
    },
    pipeline: {
      key: "pipeline",
      title: "Pipeline rules",
      intro: "How deals are kept moving.",
      fields: [
        { name: "staleDays", label: "Quiet after (days)", type: "number", min: 1, max: 365, hint: "A deal with no activity for this long is flagged on the board and in My Day." },
        { name: "requireNextStep", label: "Every open deal needs a next step", type: "switch", hint: "Warns when a deal has no next step and nudges the owner." },
      ],
    },
    pricingLanguage: {
      key: "pricingLanguage",
      title: "Pricing language",
      intro: "How prices are described publicly. The assistant and marketing checks follow these rules.",
      fields: [
        { name: "publicPrefix", label: "Public prefix", type: "text", hint: "Public prices read as 'from $X'." },
        { name: "raasFrom", label: "Robot as a Service from ($/month)", type: "number", min: 0 },
        { name: "purchaseFrom", label: "Purchase from ($)", type: "number", min: 0 },
        { name: "hideFinancedFigure", label: "Never state a financed monthly figure publicly", type: "switch", hint: "Financed figures only appear on a quote after credit approval." },
      ],
    },
    email: {
      key: "email",
      title: "Email",
      intro: "Footer and length rules for outreach drafts.",
      fields: [
        { name: "footerHtml", label: "Footer HTML", type: "textarea", rows: 4, mono: true, hint: "Appended to outreach and system mail. Keep the unsubscribe line." },
        { name: "maxOutreachWords", label: "Max outreach words", type: "number", min: 20, max: 1000 },
        { name: "targetOutreachWords", label: "Target outreach words", type: "text", placeholder: "70-90" },
      ],
    },
    service: {
      key: "service",
      title: "Service",
      intro: "Response time promises and maintenance rhythm.",
      fields: [
        { name: "slaHours.CRITICAL", label: "Critical: respond within (hours)", type: "number", min: 1, max: 720 },
        { name: "slaHours.HIGH", label: "High: respond within (hours)", type: "number", min: 1, max: 720 },
        { name: "slaHours.NORMAL", label: "Normal: respond within (hours)", type: "number", min: 1, max: 720 },
        { name: "slaHours.LOW", label: "Low: respond within (hours)", type: "number", min: 1, max: 720 },
        { name: "maintenanceIntervalDays", label: "Maintenance every (days)", type: "number", min: 1, max: 730 },
        { name: "renewalAlertDays", label: "Renewal alert before term end (days)", type: "number", min: 1, max: 365 },
      ],
    },
    assistant: {
      key: "assistant",
      title: "Assistant",
      intro: "Model and the house rules every draft must follow.",
      fields: [
        { name: "model", label: "Model", type: "text", mono: true, placeholder: "claude-opus-5" },
        { name: "maxTokens", label: "Max tokens per reply", type: "number", min: 256, max: 64000 },
        { name: "rules", label: "Rules", type: "list", hint: "One rule per line. The assistant reads these before every answer.", placeholder: "Never promise a demo in outreach" },
      ],
    },
    leads: {
      key: "leads",
      title: "Leads",
      intro: "What happens when a new lead arrives from the website, chat or an integration.",
      fields: [
        { name: "defaultOwnerEmail", label: "Default owner", type: "select", options: [{ value: "", label: "Nobody (leave unassigned)" }, ...staff.map((s) => ({ value: s.email, label: `${s.name} (${s.email})` }))], hint: "New leads without an owner go to this person." },
        { name: "autoDeal", label: "Create a deal automatically for each new lead", type: "switch" },
        { name: "notifyEmails", label: "Notify these emails", type: "list", placeholder: "name@spectrumrobotics.ai" },
      ],
    },
    followUp: {
      key: "followUp",
      title: "Follow ups",
      intro: "How HQ reads each person's connected mailbox to find people, spot quiet leads and remind them to follow up. Every mailbox stays private to its owner.",
      fields: [
        { name: "historyDays", label: "How far back to read on first connect (days)", type: "number", min: 30, max: 730, hint: "Older mail is read once to build the people list. After that only new mail is synced." },
        { name: "replyWithinDays", label: "Flag emails I have not answered after (days)", type: "number", min: 1, max: 30 },
        { name: "waitingOnThemDays", label: "Flag people who have not replied to me after (days)", type: "number", min: 1, max: 60 },
        { name: "quietDays", label: "A relationship has gone quiet after (days)", type: "number", min: 7, max: 365 },
        { name: "leadMinExchanges", label: "Two way exchanges before someone counts as a possible lead", type: "number", min: 1, max: 20 },
        { name: "autoTasks", label: "Create follow up tasks automatically during the nightly sync", type: "switch" },
      ],
    },
    social: {
      key: "social",
      title: "Social",
      intro: "Approval rules for social posts.",
      fields: [
        { name: "requireApproval", label: "Posts need approval before publishing", type: "switch" },
        { name: "approverTier", label: "Who approves", type: "select", options: [{ value: "OWNER", label: "Owners" }, { value: "LEADERSHIP", label: "Owners and leadership" }] },
      ],
    },
    portal: {
      key: "portal",
      title: "Client portal",
      intro: "How customers get in.",
      fields: [
        { name: "selfSignup", label: "Allow customers to sign up themselves", type: "switch", hint: "Off means portal access is by invitation only." },
        { name: "autoApproveMatchingDomain", label: "Auto approve when the email domain matches a portal enabled company", type: "switch" },
        { name: "welcomeMessage", label: "Welcome message", type: "textarea", rows: 2 },
      ],
    },
  };
}

export function SettingsTabs({ values, stages, departments, staff }: { values: SettingsValues; stages: StageRow[]; departments: DepartmentRow[]; staff: StaffOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab = sp.get("tab") && TABS.some((t) => t.key === sp.get("tab")) ? (sp.get("tab") as string) : "company";
  const setTab = (key: string) => router.replace(`${pathname}?tab=${key}`, { scroll: false });
  const all = React.useMemo(() => specs(staff), [staff]);
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col" aria-label="Settings sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn("shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors", tab === t.key ? "bg-brand-tint text-brand-deep dark:text-brand-bright" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0">
        {tab === "departments" ? (
          <DepartmentsForm departments={departments} staff={staff} />
        ) : tab === "pipeline" ? (
          <div className="flex flex-col gap-5">
            <GroupForm key="pipeline" spec={all.pipeline} values={values.pipeline} />
            <PipelineStagesForm stages={stages} />
          </div>
        ) : all[tab] ? (
          <GroupForm key={tab} spec={all[tab]} values={values[tab]} />
        ) : null}
      </div>
    </div>
  );
}
