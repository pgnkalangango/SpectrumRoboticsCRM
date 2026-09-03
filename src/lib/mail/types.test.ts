import { describe, expect, it } from "vitest";
import { htmlToText, parseAddress, parseAddressList } from "./types";

describe("htmlToText", () => {
  it("strips markup and keeps line breaks", () => {
    const text = htmlToText("<style>p{}</style><p>Hello&nbsp;<b>there</b></p><div>Line two<br>Line three</div>");
    expect(text).toBe("Hello there\nLine two\nLine three");
  });
  it("decodes common entities", () => {
    expect(htmlToText("Fish &amp; Chips &lt;3 &quot;yes&quot; it&#39;s")).toBe('Fish & Chips <3 "yes" it\'s');
  });
  it("handles empty input", () => {
    expect(htmlToText(null)).toBe("");
  });
});

describe("parseAddress", () => {
  it("reads display name and email", () => {
    expect(parseAddress('"Dana Jenkins" <DJenkins@spectrumrobotics.ai>')).toEqual({ name: "Dana Jenkins", email: "djenkins@spectrumrobotics.ai" });
  });
  it("reads a bare email", () => {
    expect(parseAddress("<pg@spectrumrobotics.ai>")).toEqual({ name: null, email: "pg@spectrumrobotics.ai" });
  });
  it("rejects junk", () => {
    expect(parseAddress("not an address")).toBeNull();
  });
  it("splits lists while respecting quoted commas", () => {
    const list = parseAddressList('"Smith, Jo" <jo@example.com>, ops@example.com');
    expect(list.map((a) => a.email)).toEqual(["jo@example.com", "ops@example.com"]);
    expect(list[0].name).toBe("Smith, Jo");
  });
});
