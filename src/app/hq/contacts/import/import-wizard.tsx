"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Checkbox, Progress } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importContacts, type ImportRow, type ImportSummary } from "@/server/actions/import";

type Target = keyof Omit<ImportRow, "row">;
const TARGETS: { value: Target; label: string; aliases: string[] }[] = [
  { value: "firstName", label: "First name", aliases: ["first name", "firstname", "first", "given name", "fname"] },
  { value: "lastName", label: "Last name", aliases: ["last name", "lastname", "last", "surname", "family name", "lname"] },
  { value: "fullName", label: "Full name (split)", aliases: ["name", "full name", "fullname", "contact", "contact name"] },
  { value: "email", label: "Email", aliases: ["email", "e-mail", "email address", "work email"] },
  { value: "phone", label: "Phone", aliases: ["phone", "mobile", "cell", "phone number", "telephone", "mobile phone"] },
  { value: "company", label: "Company", aliases: ["company", "organization", "organisation", "account", "business", "company name", "venue"] },
  { value: "title", label: "Job title", aliases: ["title", "job title", "position", "role"] },
  { value: "type", label: "Type", aliases: ["type", "contact type", "stage"] },
  { value: "source", label: "Source", aliases: ["source", "lead source", "origin", "channel"] },
  { value: "city", label: "City", aliases: ["city", "town"] },
  { value: "state", label: "State", aliases: ["state", "province", "region"] },
  { value: "tags", label: "Tags", aliases: ["tags", "labels", "segments", "industry"] },
  { value: "notes", label: "Notes", aliases: ["notes", "comments", "description", "remarks"] },
];

function detect(header: string): Target | "" {
  const h = header.trim().toLowerCase().replace(/[_\-.]+/g, " ");
  for (const t of TARGETS) if (t.value.toLowerCase() === h || t.aliases.includes(h)) return t.value;
  for (const t of TARGETS) if (t.aliases.some((a) => h.includes(a))) return t.value;
  return "";
}

type Mapping = Record<string, Target | "">;
type Step = 1 | 2 | 3 | 4;
const BATCH = 100;

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [data, setData] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Mapping>({});
  const [createCompanies, setCreateCompanies] = React.useState(true);
  const [progress, setProgress] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const onFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Choose a .csv file. Export from Excel or Google Sheets as CSV first.");
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const cols = (res.meta.fields ?? []).filter(Boolean);
        if (cols.length === 0 || res.data.length === 0) {
          toast.error("That file looks empty. The first row should be column names.");
          return;
        }
        setFileName(file.name);
        setHeaders(cols);
        setData(res.data);
        setMapping(Object.fromEntries(cols.map((c) => [c, detect(c)])));
        setStep(2);
      },
      error: () => toast.error("Could not read that file."),
    });
  };

  const mapped: ImportRow[] = React.useMemo(() => {
    return data.map((row, i) => {
      const out: ImportRow = { row: i + 2 };
      for (const [col, target] of Object.entries(mapping)) {
        if (!target) continue;
        const v = (row[col] ?? "").trim();
        if (!v) continue;
        out[target] = out[target] ? `${out[target]} ${v}` : v;
      }
      return out;
    });
  }, [data, mapping]);

  const stats = React.useMemo(() => {
    const emails = new Map<string, number>();
    let withEmail = 0;
    let noName = 0;
    for (const r of mapped) {
      const e = (r.email ?? "").toLowerCase();
      if (e) {
        withEmail++;
        emails.set(e, (emails.get(e) ?? 0) + 1);
      }
      if (!r.firstName && !r.fullName && !e) noName++;
    }
    const dupes = Array.from(emails.values()).filter((n) => n > 1).reduce((a, n) => a + n - 1, 0);
    return { total: mapped.length, withEmail, dupes, noName, companies: new Set(mapped.map((r) => (r.company ?? "").toLowerCase()).filter(Boolean)).size };
  }, [mapped]);

  const targetsUsed = Object.values(mapping).filter(Boolean);
  const hasIdentity = targetsUsed.includes("email") || targetsUsed.includes("firstName") || targetsUsed.includes("fullName");
  const dupTargets = targetsUsed.filter((t, i, a) => a.indexOf(t) !== i);

  const run = async () => {
    setRunning(true);
    setProgress(0);
    const total: ImportSummary = { created: 0, updated: 0, skipped: [] };
    for (let i = 0; i < mapped.length; i += BATCH) {
      const batch = mapped.slice(i, i + BATCH);
      const r = await importContacts(batch, { createCompanies });
      if (!r.ok) {
        toast.error(r.error);
        setRunning(false);
        return;
      }
      if (r.data) {
        total.created += r.data.created;
        total.updated += r.data.updated;
        total.skipped.push(...r.data.skipped);
      }
      setProgress(Math.round(((i + batch.length) / mapped.length) * 100));
    }
    setSummary(total);
    setRunning(false);
    setStep(4);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-5xl">
      <ol className="mb-6 flex items-center gap-2 text-xs">
        {["Upload", "Map columns", "Review", "Done"].map((l, i) => {
          const n = (i + 1) as Step;
          return (
            <li key={l} className="flex items-center gap-2">
              <span className={cn("flex size-6 items-center justify-center rounded-full text-[11px] font-bold", step === n ? "bg-brand text-white" : step > n ? "bg-ok text-white" : "bg-surface-2 text-muted")}>{step > n ? <CheckCircle2 className="size-3.5" /> : n}</span>
              <span className={cn("font-semibold", step === n ? "text-ink" : "text-muted")}>{l}</span>
              {i < 3 ? <span className="mx-1 h-px w-8 bg-line" /> : null}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface px-6 py-16 text-center transition-colors", dragging ? "border-brand bg-brand-tint/30" : "border-line hover:border-line-strong")}
          >
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand-deep dark:text-brand-bright">
              <Upload className="size-5" />
            </span>
            <span className="font-display text-[15px] font-semibold text-ink">Drop a CSV here, or click to choose</span>
            <span className="mt-1 max-w-sm text-sm text-muted">First row must be column names. Up to a few thousand rows is fine; the import runs in batches of 100.</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileSpreadsheet className="size-4 text-brand" /> Template
              </div>
              <p className="mt-1 text-xs text-muted">Columns the importer recognizes on its own: first_name, last_name, email, phone, company, title, type, source, city, state, tags, notes.</p>
              <Button asChild size="sm" variant="secondary" className="mt-3 w-full">
                <a href="/hq/contacts/import/template" download>
                  <Download /> Download template
                </a>
              </Button>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="text-sm font-semibold text-ink">Export</div>
              <p className="mt-1 text-xs text-muted">Download the current contact list as CSV. The export is logged.</p>
              <Button asChild size="sm" variant="secondary" className="mt-3 w-full">
                <a href="/hq/contacts/import/export" download>
                  <Download /> Export contacts
                </a>
              </Button>
            </div>
            <p className="text-[11px] text-muted">Matching is by email. A row with an email that already exists updates that contact instead of creating a duplicate.</p>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="rounded-xl border border-line bg-surface shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{fileName}</div>
              <div className="text-xs text-muted">
                {data.length} rows · {headers.length} columns. Match each column to a contact field, or skip it.
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ArrowLeft /> Different file
            </Button>
            <Button size="sm" onClick={() => setStep(3)} disabled={!hasIdentity || dupTargets.length > 0}>
              Review <ArrowRight />
            </Button>
          </div>
          {!hasIdentity ? <p className="mx-4 mt-3 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">Map at least an email or a name column.</p> : null}
          {dupTargets.length ? <p className="mx-4 mt-3 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">Two columns point at the same field ({dupTargets.map((t) => TARGETS.find((x) => x.value === t)?.label).join(", ")}). Their values will be joined with a space.</p> : null}
          <ul className="divide-y divide-line">
            {headers.map((h) => (
              <li key={h} className="grid items-center gap-3 px-4 py-2.5 sm:grid-cols-[1fr_1fr_1fr]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{h}</div>
                </div>
                <div className="truncate text-xs text-muted" title={data.slice(0, 3).map((r) => r[h]).join(" | ")}>
                  e.g. {data.slice(0, 2).map((r) => r[h]).filter(Boolean).join(", ") || <span className="text-faint">empty</span>}
                </div>
                <NativeSelect value={mapping[h] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as Target | "" }))} className={cn(mapping[h] ? "" : "text-muted")}>
                  <option value="">Skip this column</option>
                  {TARGETS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Rows" value={stats.total} />
            <Stat label="With email" value={stats.withEmail} sub={stats.withEmail < stats.total ? `${stats.total - stats.withEmail} without email are created as new` : "All matched by email"} />
            <Stat label="Duplicate emails" value={stats.dupes} sub={stats.dupes ? "Later duplicates are skipped" : "None in this file"} tone={stats.dupes ? "warn" : "default"} />
            <Stat label="Companies named" value={stats.companies} sub={createCompanies ? "Missing ones get created" : "Missing ones stay as text"} />
          </div>
          {stats.noName ? (
            <p className="flex items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
              <AlertTriangle className="size-3.5" /> {stats.noName} row{stats.noName === 1 ? "" : "s"} have no name and no email and will be skipped.
            </p>
          ) : null}
          <div className="rounded-xl border border-line bg-surface shadow-sm">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0 flex-1 text-sm font-semibold text-ink">Preview of the first {Math.min(20, mapped.length)} rows</div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={createCompanies} onCheckedChange={(c) => setCreateCompanies(!!c)} /> Create companies that do not exist
              </label>
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                <ArrowLeft /> Back to mapping
              </Button>
              <Button size="sm" onClick={run} loading={running} disabled={mapped.length === 0}>
                <Upload /> Import {mapped.length} row{mapped.length === 1 ? "" : "s"}
              </Button>
            </div>
            {running ? (
              <div className="px-4 py-3">
                <Progress value={progress} />
                <p className="mt-1.5 text-xs text-muted">Importing in batches of {BATCH}. {progress}% done.</p>
              </div>
            ) : null}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapped.slice(0, 20).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-faint">{r.row}</TableCell>
                    <TableCell className="text-sm">{[r.firstName, r.lastName].filter(Boolean).join(" ") || r.fullName || <span className="text-faint">No name</span>}</TableCell>
                    <TableCell className="text-sm">{r.email || <span className="text-faint">None</span>}</TableCell>
                    <TableCell className="text-sm">{r.company || <span className="text-faint">None</span>}</TableCell>
                    <TableCell className="text-sm text-ink-2">{r.title}</TableCell>
                    <TableCell>{r.type ? <Badge>{r.type}</Badge> : null}</TableCell>
                    <TableCell className="text-xs text-muted">{r.tags}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {step === 4 && summary ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Created" value={summary.created} tone="ok" />
            <Stat label="Updated" value={summary.updated} tone="info" />
            <Stat label="Skipped" value={summary.skipped.length} tone={summary.skipped.length ? "warn" : "default"} />
          </div>
          {summary.skipped.length ? (
            <div className="rounded-xl border border-line bg-surface shadow-sm">
              <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Skipped rows</div>
              <ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">
                {summary.skipped.map((s, i) => (
                  <li key={i} className="flex gap-3 px-4 py-2">
                    <span className="w-14 shrink-0 text-xs text-faint">Row {s.row}</span>
                    <span className="text-ink-2">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/hq/contacts">Open contacts</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep(1);
                setSummary(null);
                setData([]);
                setHeaders([]);
              }}
            >
              Import another file
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, tone = "default" }: { label: string; value: number; sub?: string; tone?: "default" | "ok" | "warn" | "info" }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="eyebrow">{label}</div>
      <div className={cn("mt-1.5 font-display text-2xl font-bold leading-none tabular", { default: "text-ink", ok: "text-ok", warn: "text-warn", info: "text-info" }[tone])}>{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
