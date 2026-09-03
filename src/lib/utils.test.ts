import { describe, expect, it } from "vitest";
import { fullName, initials, label, money, slugify, truncate } from "./utils";

describe("utils", () => {
  it("formats money", () => {
    expect(money(1234.5)).toBe("$1,235");
    expect(money(1234.5, { cents: true })).toBe("$1,234.50");
    expect(money(null)).toBe("");
  });
  it("labels enum values", () => {
    expect(label("IN_PROGRESS")).toBe("In Progress");
    expect(label(null)).toBe("");
  });
  it("slugifies", () => {
    expect(slugify("Canva  Design Tools!")).toBe("canva-design-tools");
  });
  it("names and initials", () => {
    expect(fullName({ firstName: "Ava", lastName: "Lee" })).toBe("Ava Lee");
    expect(initials("Ava Lee")).toBe("AL");
  });
  it("truncates", () => {
    expect(truncate("abcdef", 4).length).toBeLessThanOrEqual(5);
  });
});
