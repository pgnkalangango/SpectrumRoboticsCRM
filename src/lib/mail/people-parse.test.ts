import { describe, expect, it } from "vitest";
import { companyFromDomain, extractSignature, isAutomatedAddress, relationshipScore, splitName, stripQuotedHistory } from "./people-parse";

describe("isAutomatedAddress", () => {
  it("flags no reply and notification senders", () => {
    expect(isAutomatedAddress("no-reply@calendly.com")).toBe(true);
    expect(isAutomatedAddress("notifications@github.com")).toBe(true);
    expect(isAutomatedAddress("newsletter@somecompany.com")).toBe(true);
    expect(isAutomatedAddress("messages-noreply@linkedin.com")).toBe(true);
  });
  it("keeps real people", () => {
    expect(isAutomatedAddress("joe.mccune@pennentertainment.com", "Joe McCune")).toBe(false);
    expect(isAutomatedAddress("maria@gmail.com", "Maria Lopez")).toBe(false);
  });
});

describe("companyFromDomain", () => {
  it("guesses from business domains only", () => {
    expect(companyFromDomain("pennentertainment.com")).toBe("Pennentertainment");
    expect(companyFromDomain("mail.acme-robotics.io")).toBe("Acme Robotics");
    expect(companyFromDomain("gmail.com")).toBeNull();
    expect(companyFromDomain(null)).toBeNull();
  });
});

describe("splitName", () => {
  it("handles display names, last-first order and bare emails", () => {
    expect(splitName("Joe McCune", "joe@x.com")).toEqual({ firstName: "Joe", lastName: "McCune", display: "Joe McCune" });
    expect(splitName("McCune, Joe", "joe@x.com")).toEqual({ firstName: "Joe", lastName: "McCune", display: "Joe McCune" });
    expect(splitName(null, "ava.lee@x.com")).toEqual({ firstName: "Ava", lastName: "Lee", display: "Ava Lee" });
    expect(splitName("Joe McCune (Penn)", "joe@x.com").display).toBe("Joe McCune");
  });
});

describe("stripQuotedHistory", () => {
  it("drops the quoted reply chain", () => {
    const body = "Sounds good, see you Tuesday.\n\nJoe\n\nOn Mon, Sep 1, 2026 at 9:00 AM PG <pg@spectrumrobotics.ai> wrote:\n> Can we meet Tuesday?\n> Thanks";
    expect(stripQuotedHistory(body)).toBe("Sounds good, see you Tuesday.\n\nJoe\n");
  });
});

describe("extractSignature", () => {
  const body = [
    "Hi PG,",
    "",
    "Thanks for the walkthrough yesterday. Let me get the floor plans over to you this week.",
    "",
    "Best regards,",
    "Joe McCune",
    "Director of Food and Beverage | Hollywood Casino Aurora",
    "Mobile: 630-258-6613",
    "joe.mccune@pennentertainment.com",
    "linkedin.com/in/joemccune",
    "",
    "On Tue, Sep 2, 2026, PG Nkalang'ango <pg@spectrumrobotics.ai> wrote:",
    "> Great meeting you.",
  ].join("\n");

  it("reads title, company, phone and LinkedIn from a signature", () => {
    const sig = extractSignature(body, { name: "Joe McCune", email: "joe.mccune@pennentertainment.com" });
    expect(sig.jobTitle).toBe("Director of Food and Beverage");
    expect(sig.company).toBe("Hollywood Casino Aurora");
    expect(sig.phone).toBe("(630) 258-6613");
    expect(sig.linkedinUrl).toBe("https://www.linkedin.com/in/joemccune");
    expect(sig.signature).toContain("Joe McCune");
    expect(sig.signature).not.toContain("Great meeting you");
  });

  it("reads a stacked signature", () => {
    const stacked = "Thanks!\n\nAva Lee\nOperations Manager\nBrightline Hotels\nO: (312) 555-0100 x204\nwww.brightlinehotels.com";
    const sig = extractSignature(stacked, { name: "Ava Lee", email: "ava@brightlinehotels.com" });
    expect(sig.jobTitle).toBe("Operations Manager");
    expect(sig.company).toBe("Brightline Hotels");
    expect(sig.phone).toBe("(312) 555-0100 x204");
  });

  it("returns nothing for empty or signature free mail", () => {
    expect(extractSignature("", { email: "a@b.com" }).jobTitle).toBeNull();
    expect(extractSignature("ok thanks", { email: "a@b.com" }).phone).toBeNull();
  });
});

describe("relationshipScore", () => {
  it("rewards two way business conversations and zeroes automated senders", () => {
    const strong = relationshipScore({ messagesIn: 6, messagesOut: 5, threads: 4, lastSeenAt: new Date(), business: true, automated: false, internal: false });
    const weak = relationshipScore({ messagesIn: 1, messagesOut: 0, threads: 1, lastSeenAt: new Date(Date.now() - 400 * 86400000), business: false, automated: false, internal: false });
    expect(strong).toBeGreaterThan(80);
    expect(weak).toBeLessThan(10);
    expect(relationshipScore({ messagesIn: 50, messagesOut: 0, threads: 50, lastSeenAt: new Date(), business: true, automated: true, internal: false })).toBe(0);
  });
});
