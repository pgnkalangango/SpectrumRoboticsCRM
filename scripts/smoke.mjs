// Browser smoke test: signs in as the seeded owner and screenshots the main screens.
// Usage: SHOTS_DIR=/tmp/shots node scripts/smoke.mjs   (server must be running on :3000)
import { chromium } from "@playwright/test";
import fs from "node:fs";
const out = process.env.SHOTS_DIR || "/tmp/hq-shots";
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
const shot = async (name, full = false) => page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
const go = async (path) => { const r = await page.goto(base + path, { waitUntil: "load", timeout: 30000 }); await page.waitForTimeout(600); return r?.status(); };

await go("/login"); await shot("01-login");
await page.fill('input[name=email]', process.env.SMOKE_EMAIL || "pg@spectrumrobotics.ai");
await page.fill('input[name=password]', process.env.SMOKE_PASSWORD || "SpectrumHQ-2026!");
await page.click('button[type=submit]:has-text("Sign in")');
await page.waitForURL(/\/hq/, { timeout: 20000 });
await page.waitForTimeout(1200);
await shot("02-my-day", true);
const closeTour = page.locator(".driver-popover-close-btn");
if (await closeTour.count()) await closeTour.first().click();
await page.keyboard.press("Control+k"); await page.waitForTimeout(300); await page.keyboard.type("hollywood"); await page.waitForTimeout(900); await shot("03-palette"); await page.keyboard.press("Escape");
const pages = (process.env.SMOKE_PAGES || "/hq/contacts,/hq/companies,/hq/deals,/hq/deals?view=list").split(",");
let i = 10;
for (const p of pages) { const s = await go(p); console.log(p, s); await shot(`${i++}-${p.replace(/[^a-z0-9]+/gi, "-")}`, true); }
// first record of each list
for (const [list, name] of [["/hq/contacts", "contact"], ["/hq/companies", "company"], ["/hq/deals?view=list", "deal"]]) {
  await go(list);
  const href = await page.locator(`a[href^="${list.split("?")[0]}/"]`).first().getAttribute("href").catch(() => null);
  if (href) { const s = await go(href); console.log(href, s); await shot(`${i++}-${name}-detail`, true); }
}
const ps = await go("/portal"); console.log("/portal", ps); await shot(`${i++}-portal`, true);
await go("/signup"); await shot(`${i++}-signup`);
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
