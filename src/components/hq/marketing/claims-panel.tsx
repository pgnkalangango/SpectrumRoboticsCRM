"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { checkClaims, CLAIM_RULE_LABELS, type ClaimsResult } from "@/lib/claims-check";
import { Checkbox } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function useClaims(body: string, metadata: string, knownCompanies: string[]): ClaimsResult {
  const [result, setResult] = React.useState<ClaimsResult>(() => checkClaims(body, { knownCompanies, metadata }));
  React.useEffect(() => {
    const t = setTimeout(() => setResult(checkClaims(body, { knownCompanies, metadata })), 200);
    return () => clearTimeout(t);
  }, [body, metadata, knownCompanies]);
  return result;
}

export function ClaimsPanel({ result, canOverride, override, onOverride, className }: { result: ClaimsResult; canOverride: boolean; override: boolean; onOverride: (v: boolean) => void; className?: string }) {
  const blocks = result.findings.filter((f) => f.severity === "block");
  const warns = result.findings.filter((f) => f.severity === "warn");
  return (
    <section className={cn("rounded-xl border border-line bg-surface-2/50", className)}>
      <header className="flex items-center justify-between px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <ShieldAlert className="size-4 text-brand" /> Claims check
        </h3>
        {result.ok ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-ok">
            <CheckCircle2 className="size-3.5" /> Looks good
          </span>
        ) : (
          <span className="text-xs text-muted">
            {blocks.length ? `${blocks.length} blocking` : ""}
            {blocks.length && warns.length ? " · " : ""}
            {warns.length ? `${warns.length} to review` : ""}
          </span>
        )}
      </header>
      {result.ok ? (
        <p className="px-3 pb-3 text-xs text-muted">No pricing, claims, demo or permission issues found. Company rules: pricing reads &quot;from $X&quot;, figures need a source, no demo promises, no guarantees.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 px-3 pb-3">
          {result.findings.map((f, i) => (
            <li key={i} className={cn("rounded-lg border px-2.5 py-2 text-xs", f.severity === "block" ? "border-bad/30 bg-bad-soft/60" : "border-warn/30 bg-warn-soft/60")}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", f.severity === "block" ? "text-bad" : "text-warn")} />
                <div className="min-w-0">
                  <div className="font-semibold text-ink">
                    {f.severity === "block" ? "Blocks publishing" : "Review"} · {CLAIM_RULE_LABELS[f.rule]}
                  </div>
                  <p className="mt-0.5 text-ink-2">{f.message}</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted" title={f.snippet}>
                    {f.snippet}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {blocks.length > 0 && canOverride ? (
        <label className="flex cursor-pointer items-start gap-2 border-t border-line px-3 py-2.5 text-xs text-ink-2">
          <Checkbox checked={override} onCheckedChange={(v) => onOverride(v === true)} className="mt-0.5" />
          <span>
            <span className="font-semibold text-ink">I have checked this.</span> Publish or schedule anyway. Your name is recorded with the override.
          </span>
        </label>
      ) : null}
    </section>
  );
}
