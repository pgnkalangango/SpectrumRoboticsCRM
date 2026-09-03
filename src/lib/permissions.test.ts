import { describe, expect, it } from "vitest";
import { atLeast, can, isClient, isStaff } from "./permissions";

const staff = (tier: "OWNER" | "LEADERSHIP" | "EMPLOYEE", permissions: string[] = []) => ({ kind: "STAFF" as const, tier, permissions });

describe("permissions", () => {
  it("owners can do everything", () => {
    expect(can(staff("OWNER"), "finance.view")).toBe(true);
    expect(can(staff("OWNER", ["-finance.view"]), "finance.view")).toBe(true);
  });

  it("tier defaults apply", () => {
    expect(can(staff("LEADERSHIP"), "quotes.approve")).toBe(true);
    expect(can(staff("LEADERSHIP"), "quotes.discount")).toBe(false);
    expect(can(staff("EMPLOYEE"), "social.draft")).toBe(true);
    expect(can(staff("EMPLOYEE"), "social.post")).toBe(false);
  });

  it("explicit grants and denies override defaults", () => {
    expect(can(staff("EMPLOYEE", ["social.post"]), "social.post")).toBe(true);
    expect(can(staff("LEADERSHIP", ["-quotes.approve"]), "quotes.approve")).toBe(false);
  });

  it("clients and anonymous users never pass", () => {
    expect(can({ kind: "CLIENT", tier: "CLIENT", permissions: ["settings.manage"] }, "settings.manage")).toBe(false);
    expect(can(null, "settings.manage")).toBe(false);
  });

  it("tier ranking and kind helpers", () => {
    expect(atLeast("LEADERSHIP", "EMPLOYEE")).toBe(true);
    expect(atLeast("EMPLOYEE", "LEADERSHIP")).toBe(false);
    expect(isStaff(staff("EMPLOYEE"))).toBe(true);
    expect(isClient({ kind: "CLIENT" })).toBe(true);
    expect(isClient(undefined)).toBe(false);
  });
});
