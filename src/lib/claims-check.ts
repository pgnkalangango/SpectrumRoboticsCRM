// Proof and claims check for public copy (social posts, captions, ads).
// Pure and explainable: every finding names the rule, the snippet and what to change.
// Company rules it enforces:
//   1. Pricing is always "from $X". A dollar figure without "from" in front is a warning.
//   2. Percentages and "X hours saved" style figures need a source or a hedge nearby
//      (OEM, documented, results vary, typical, reported). Otherwise a warning.
//   3. No demo promises and no guarantees: "demo", "free demo", "free trial",
//      "guarantee", "guaranteed" block the post.
//   4. Em dashes are a warning (replace with a comma, period or colon).
//   5. Naming a customer needs their permission. Known company names are a warning
//      unless the post metadata mentions "permission".

export type ClaimSeverity = "block" | "warn";
export type ClaimFinding = { severity: ClaimSeverity; rule: ClaimRule; message: string; snippet: string; index: number };
export type ClaimRule = "pricing_prefix" | "unsourced_figure" | "forbidden_promise" | "em_dash" | "customer_name";
export type ClaimsResult = { ok: boolean; blocked: boolean; findings: ClaimFinding[] };

export type ClaimsOptions = {
  /** Company names that must not be named without permission (usually active customers). */
  knownCompanies?: string[];
  /** Post metadata (title, internal notes). If it contains the word "permission", customer names are allowed. */
  metadata?: string | null;
};

const HEDGE_WORDS = ["oem", "documented", "results vary", "typical", "typically", "reported", "reports", "report", "according to", "per the"];
const BLOCKED_PHRASES = /\b(free\s+demo|free\s+trial|demos?|guaranteed|guarantees?)\b/gi;
const DOLLAR = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m)?\b(?:\s?\/\s?(?:mo|month|mth|yr|year|wk|week|day))?/gi;
const PERCENT = /\b\d+(?:\.\d+)?\s?(?:%|percent\b)/gi;
const SAVED_FIGURE = /\b\d+(?:\.\d+)?\+?\s?(?:hours?|hrs?|minutes?|mins?|days?|weeks?|months?|dollars?|steps|miles|labor hours)\s+(?:saved|of savings|less|fewer|faster|reduction|cut)\b|\b(?:saves?|saving|saved|cut|cuts|reduce[sd]?)\s+(?:up to\s+)?\d+(?:\.\d+)?\+?\s?(?:hours?|hrs?|minutes?|mins?|days?|weeks?|%|percent)\b/gi;
const EM_DASH = /—/g;

function snippetAround(text: string, index: number, length: number, pad = 28): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

function precededByFrom(text: string, index: number): boolean {
  // Allow "from $799", "from  $799", "from: $799" and "starting from $799".
  const before = text.slice(Math.max(0, index - 20), index).toLowerCase();
  return /\bfrom\s*:?\s*$/.test(before);
}

function hasHedgeNearby(text: string, index: number, length: number): boolean {
  // Look inside the sentence and a small window around the figure.
  const windowStart = Math.max(0, index - 120);
  const windowEnd = Math.min(text.length, index + length + 120);
  const window = text.slice(windowStart, windowEnd).toLowerCase();
  return HEDGE_WORDS.some((w) => window.includes(w));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkClaims(text: string, options: ClaimsOptions = {}): ClaimsResult {
  const findings: ClaimFinding[] = [];
  const source = text ?? "";

  // 1. Pricing prefix.
  for (const m of source.matchAll(DOLLAR)) {
    const idx = m.index ?? 0;
    if (!precededByFrom(source, idx)) {
      findings.push({ severity: "warn", rule: "pricing_prefix", index: idx, snippet: snippetAround(source, idx, m[0].length), message: `Public pricing must read "from ${m[0].trim()}". Add "from" in front of the figure, or remove it.` });
    }
  }

  // 2. Unsourced figures: percentages and "X hours saved".
  const figureMatches = [...source.matchAll(PERCENT), ...source.matchAll(SAVED_FIGURE)].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const seen = new Set<number>();
  for (const m of figureMatches) {
    const idx = m.index ?? 0;
    if (seen.has(idx)) continue;
    seen.add(idx);
    if (!hasHedgeNearby(source, idx, m[0].length)) {
      findings.push({ severity: "warn", rule: "unsourced_figure", index: idx, snippet: snippetAround(source, idx, m[0].length), message: `"${m[0].trim()}" needs a source or a hedge nearby: say where it comes from (OEM, documented, reported), call it typical, or add "results vary".` });
    }
  }

  // 3. Demo promises and guarantees block the post.
  for (const m of source.matchAll(BLOCKED_PHRASES)) {
    const idx = m.index ?? 0;
    const word = m[0].toLowerCase();
    const isGuarantee = word.startsWith("guarantee");
    findings.push({ severity: "block", rule: "forbidden_promise", index: idx, snippet: snippetAround(source, idx, m[0].length), message: isGuarantee ? `"${m[0]}" is a guarantee. We do not guarantee outcomes in public copy. Describe what the robot does instead.` : `"${m[0]}" promises a demo. Demo requests go to an owner; invite people to a 20 minute assessment call instead.` });
  }

  // 4. Em dashes.
  for (const m of source.matchAll(EM_DASH)) {
    const idx = m.index ?? 0;
    findings.push({ severity: "warn", rule: "em_dash", index: idx, snippet: snippetAround(source, idx, 1), message: "Replace the em dash with a comma, period or colon." });
  }

  // 5. Customer names without permission.
  const hasPermission = /permission/i.test(options.metadata ?? "");
  if (!hasPermission) {
    for (const name of options.knownCompanies ?? []) {
      const clean = name.trim();
      if (clean.length < 3) continue;
      const re = new RegExp(`(?<![\\w])${escapeRegExp(clean)}(?![\\w])`, "i");
      const m = re.exec(source);
      if (m) {
        findings.push({ severity: "warn", rule: "customer_name", index: m.index, snippet: snippetAround(source, m.index, m[0].length), message: `Naming ${clean} needs their written permission. Once you have it, add the word "permission" to the post title or notes, or remove the name.` });
      }
    }
  }

  findings.sort((a, b) => (a.severity === b.severity ? a.index - b.index : a.severity === "block" ? -1 : 1));
  const blocked = findings.some((f) => f.severity === "block");
  return { ok: findings.length === 0, blocked, findings };
}

export const CLAIM_RULE_LABELS: Record<ClaimRule, string> = {
  pricing_prefix: "Pricing language",
  unsourced_figure: "Unsourced figure",
  forbidden_promise: "Demo or guarantee",
  em_dash: "Em dash",
  customer_name: "Customer name",
};
