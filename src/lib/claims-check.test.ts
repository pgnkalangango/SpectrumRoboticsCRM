import { describe, expect, it } from "vitest";
import { checkClaims } from "./claims-check";

const rules = (text: string, opts?: Parameters<typeof checkClaims>[1]) => checkClaims(text, opts).findings.map((f) => `${f.severity}:${f.rule}`);

describe("checkClaims", () => {
  it("passes clean copy", () => {
    const r = checkClaims("BellaBot Pro is now available for restaurants in Chicagoland, from $799/mo. Book a 20 minute assessment call.");
    expect(r.ok).toBe(true);
    expect(r.blocked).toBe(false);
    expect(r.findings).toEqual([]);
  });

  it("warns on a dollar amount that is not preceded by from", () => {
    expect(rules("Own a BellaBot for $3,800 today.")).toEqual(["warn:pricing_prefix"]);
    expect(rules("Robots start at $799/mo.")).toEqual(["warn:pricing_prefix"]);
  });

  it("accepts pricing that reads from $X", () => {
    expect(rules("Pricing from $3,800 or from $799/mo.")).toEqual([]);
    expect(rules("Starting from: $799 per month")).toEqual([]);
  });

  it("warns on percentages and hours saved without a hedge", () => {
    expect(rules("Cut delivery time by 40%.")).toEqual(["warn:unsourced_figure"]);
    expect(rules("Operators report 12 hours saved every week.")).toEqual([]);
    expect(rules("12 hours saved every week.")).toEqual(["warn:unsourced_figure"]);
    expect(rules("Saves 3 hours per shift.")).toEqual(["warn:unsourced_figure"]);
  });

  it("accepts figures with OEM, documented, typical, reported or results vary nearby", () => {
    expect(rules("OEM documented: 30% more table turns. Results vary by site.")).toEqual([]);
    expect(rules("A typical site reports 25% fewer trips to the kitchen.")).toEqual([]);
  });

  it("blocks demo promises and guarantees", () => {
    const r = checkClaims("Book a free demo today. Satisfaction guaranteed!");
    expect(r.blocked).toBe(true);
    expect(r.findings.map((f) => f.rule)).toEqual(["forbidden_promise", "forbidden_promise"]);
    expect(rules("We guarantee results.")).toEqual(["block:forbidden_promise"]);
    expect(rules("Start your free trial.")).toEqual(["block:forbidden_promise"]);
    expect(rules("Ask for a demo.")).toEqual(["block:forbidden_promise"]);
  });

  it("does not flag words that merely contain demo", () => {
    expect(rules("Our demographic is hospitality.")).toEqual([]);
  });

  it("warns on em dashes with a replacement suggestion", () => {
    const r = checkClaims("Robots that work — every shift.");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].rule).toBe("em_dash");
    expect(r.findings[0].message).toMatch(/comma, period or colon/);
  });

  it("warns on known customer names unless the metadata mentions permission", () => {
    const known = ["Hollywood Casino Aurora", "Rivers Casino"];
    expect(rules("Now serving guests at Hollywood Casino Aurora.", { knownCompanies: known })).toEqual(["warn:customer_name"]);
    expect(rules("Now serving guests at hollywood casino aurora.", { knownCompanies: known, metadata: "Post approved with written permission from the GM" })).toEqual([]);
    expect(rules("Now serving guests at a casino in Aurora.", { knownCompanies: known })).toEqual([]);
  });

  it("orders blocking findings first and reports snippets", () => {
    const r = checkClaims("Only $499 — guaranteed to save 5 hours a day.");
    expect(r.findings[0].severity).toBe("block");
    expect(r.findings.every((f) => f.snippet.length > 0)).toBe(true);
    expect(r.ok).toBe(false);
  });
});
