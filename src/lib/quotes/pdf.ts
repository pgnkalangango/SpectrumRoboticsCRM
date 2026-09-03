// Branded quote and invoice PDFs with pdf-lib. One generator for both document kinds so the
// client sees the same layout whether they open the HTML page or the download.

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { AnyDoc, DocLine } from "@/lib/quotes/document";

const BRAND = rgb(20 / 255, 156 / 255, 160 / 255);
const BRAND_DEEP = rgb(15 / 255, 124 / 255, 128 / 255);
const INK = rgb(20 / 255, 21 / 255, 23 / 255);
const INK2 = rgb(63 / 255, 70 / 255, 80 / 255);
const MUTED = rgb(110 / 255, 119 / 255, 128 / 255);
const LINE = rgb(218 / 255, 227 / 255, 228 / 255);
const TINT = rgb(227 / 255, 243 / 255, 244 / 255);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

// pdf-lib's standard fonts only know WinAnsi; strip anything else so encoding never throws.
function clean(s: string): string {
  return s.replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) out.push(line);
        // Very long single words are cut hard so they never overflow the column.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

type Ctx = { pdf: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont; doc: AnyDoc; pageNo: number };

function text(ctx: Ctx, s: string, x: number, y: number, opts: { size?: number; bold?: boolean; color?: RGB; align?: "left" | "right" | "center"; width?: number } = {}) {
  const size = opts.size ?? 10;
  const font = opts.bold ? ctx.bold : ctx.font;
  const str = clean(s);
  let dx = x;
  if (opts.align === "right") dx = x + (opts.width ?? 0) - font.widthOfTextAtSize(str, size);
  if (opts.align === "center") dx = x + ((opts.width ?? 0) - font.widthOfTextAtSize(str, size)) / 2;
  ctx.page.drawText(str, { x: dx, y, size, font, color: opts.color ?? INK });
}

function hr(ctx: Ctx, y: number, color = LINE, thickness = 0.75) {
  ctx.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness, color });
}

function footer(ctx: Ctx) {
  const y = 30;
  ctx.page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE_W - MARGIN, y: y + 14 }, thickness: 0.5, color: LINE });
  const lines = wrap(ctx.doc.footer, ctx.font, 7.5, CONTENT_W - 60);
  text(ctx, lines[0] ?? "", MARGIN, y, { size: 7.5, color: MUTED });
  text(ctx, `Page ${ctx.pageNo}`, MARGIN, y, { size: 7.5, color: MUTED, align: "right", width: CONTENT_W });
}

function newPage(ctx: Ctx, withHeader: boolean) {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.pageNo += 1;
  ctx.y = withHeader ? header(ctx) : PAGE_H - MARGIN;
  footer(ctx);
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < 60) {
    newPage(ctx, false);
    // A small running header on continuation pages.
    text(ctx, `${ctx.doc.kind === "quote" ? "Quote" : "Invoice"} ${ctx.doc.number} (continued)`, MARGIN, ctx.y, { size: 9, color: MUTED });
    ctx.y -= 22;
  }
}

function header(ctx: Ctx): number {
  const bandH = 96;
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - bandH, width: PAGE_W, height: bandH, color: BRAND });
  // Wordmark: SPECTRUM in heavy caps, ROBOTICS letterspaced under it, a light orbit line above.
  const top = PAGE_H - 40;
  text(ctx, "SPECTRUM", MARGIN, top, { size: 26, bold: true, color: WHITE });
  const spaced = "R O B O T I C S";
  text(ctx, spaced, MARGIN + 2, top - 16, { size: 8.5, bold: true, color: rgb(0.88, 0.97, 0.97) });
  ctx.page.drawLine({ start: { x: MARGIN - 6, y: top + 30 }, end: { x: MARGIN + 150, y: top + 24 }, thickness: 1.2, color: rgb(0.8, 0.95, 0.95), opacity: 0.9 });
  const label = ctx.doc.kind === "quote" ? "QUOTE" : "INVOICE";
  text(ctx, label, MARGIN, top, { size: 22, bold: true, color: WHITE, align: "right", width: CONTENT_W });
  text(ctx, ctx.doc.number, MARGIN, top - 18, { size: 11, bold: true, color: WHITE, align: "right", width: CONTENT_W });
  if (ctx.doc.kind === "quote" && ctx.doc.version > 1) text(ctx, `Version ${ctx.doc.version}`, MARGIN, top - 32, { size: 8.5, color: rgb(0.88, 0.97, 0.97), align: "right", width: CONTENT_W });
  return PAGE_H - bandH - 28;
}

function metaBlock(ctx: Ctx) {
  const d = ctx.doc;
  const colW = CONTENT_W / 3;
  const rows: { k: string; v: string }[] = [];
  if (d.kind === "quote") {
    rows.push({ k: "Date", v: dateFmt(d.issuedAt) }, { k: "Valid until", v: d.validUntil ? dateFmt(d.validUntil) : "On request" }, { k: "Prepared by", v: d.preparedBy?.name ?? d.company.name });
  } else {
    rows.push({ k: "Issue date", v: dateFmt(d.issueDate) }, { k: "Due date", v: d.dueDate ? dateFmt(d.dueDate) : d.paymentTerms ?? "On receipt" }, { k: "Terms", v: d.paymentTerms ?? "Net 30" });
  }
  rows.forEach((r, i) => {
    const x = MARGIN + i * colW;
    text(ctx, r.k.toUpperCase(), x, ctx.y, { size: 7.5, bold: true, color: MUTED });
    text(ctx, r.v, x, ctx.y - 14, { size: 10.5, bold: true, color: INK });
  });
  ctx.y -= 40;

  // Title
  const title = d.kind === "quote" ? d.title : d.title ?? `Invoice ${d.number}`;
  const tl = wrap(title, ctx.bold, 15, CONTENT_W);
  for (const l of tl) {
    text(ctx, l, MARGIN, ctx.y, { size: 15, bold: true, color: INK });
    ctx.y -= 19;
  }
  if (d.kind === "invoice" && d.quoteNumber) {
    text(ctx, `From quote ${d.quoteNumber}`, MARGIN, ctx.y, { size: 9, color: MUTED });
    ctx.y -= 14;
  }
  ctx.y -= 8;

  // Bill to and from, two columns
  const half = CONTENT_W / 2;
  const startY = ctx.y;
  text(ctx, "BILL TO", MARGIN, ctx.y, { size: 7.5, bold: true, color: MUTED });
  let y1 = ctx.y - 14;
  text(ctx, d.billTo.name, MARGIN, y1, { size: 10.5, bold: true });
  y1 -= 14;
  for (const l of [d.billTo.contactName, ...d.billTo.addressLines, d.billTo.email, d.billTo.phone].filter((s): s is string => !!s)) {
    text(ctx, l, MARGIN, y1, { size: 9.5, color: INK2 });
    y1 -= 13;
  }
  const x2 = MARGIN + half;
  text(ctx, "FROM", x2, startY, { size: 7.5, bold: true, color: MUTED });
  let y2 = startY - 14;
  text(ctx, d.company.name, x2, y2, { size: 10.5, bold: true });
  y2 -= 14;
  const from = [d.company.address, d.company.phone, d.company.email, d.preparedBy ? `${d.preparedBy.name}${d.preparedBy.title ? `, ${d.preparedBy.title}` : ""}` : null, d.preparedBy?.email ?? null].filter((s): s is string => !!s);
  for (const l of from) {
    for (const w of wrap(l, ctx.font, 9.5, half - 12)) {
      text(ctx, w, x2, y2, { size: 9.5, color: INK2 });
      y2 -= 13;
    }
  }
  ctx.y = Math.min(y1, y2) - 12;
}

function linesTable(ctx: Ctx, title: string | null, lines: DocLine[], showDiscount: boolean, monthly: boolean) {
  if (lines.length === 0) return;
  const cols = showDiscount ? [CONTENT_W - 62 - 82 - 50 - 90, 62, 82, 50, 90] : [CONTENT_W - 62 - 82 - 90, 62, 82, 90];
  const heads = showDiscount ? ["Description", "Qty", monthly ? "Per month" : "Unit price", "Disc.", monthly ? "Monthly" : "Amount"] : ["Description", "Qty", monthly ? "Per month" : "Unit price", monthly ? "Monthly" : "Amount"];
  ensure(ctx, 60);
  if (title) {
    text(ctx, title.toUpperCase(), MARGIN, ctx.y, { size: 8, bold: true, color: BRAND_DEEP });
    ctx.y -= 16;
  }
  // header row
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 6, width: CONTENT_W, height: 20, color: TINT });
  let x = MARGIN + 8;
  heads.forEach((h, i) => {
    text(ctx, h.toUpperCase(), x, ctx.y, { size: 7.5, bold: true, color: MUTED, align: i === 0 ? "left" : "right", width: i === 0 ? undefined : cols[i] - 12 });
    x += cols[i];
  });
  ctx.y -= 24;
  for (const l of lines) {
    const descLines = wrap(l.description, ctx.font, 9.5, cols[0] - 16);
    const textH = Math.max(1, descLines.length) * 12.5;
    ensure(ctx, textH + 22);
    let dy = ctx.y;
    for (const dl of descLines) {
      text(ctx, dl, MARGIN + 8, dy, { size: 9.5, color: INK });
      dy -= 12.5;
    }
    let cx = MARGIN + 8 + cols[0];
    const cells = showDiscount ? [String(l.quantity), usd(l.unitPrice), l.discountPct ? `${l.discountPct}%` : "", usd(l.total)] : [String(l.quantity), usd(l.unitPrice), usd(l.total)];
    cells.forEach((c, i) => {
      text(ctx, c, cx, ctx.y, { size: 9.5, color: i === cells.length - 1 ? INK : INK2, align: "right", width: cols[i + 1] - 12, bold: i === cells.length - 1 });
      cx += cols[i + 1];
    });
    // Separator sits under the last text line, then the next baseline starts a clear gap below it.
    const bottom = ctx.y - (textH - 12.5) - 7;
    hr(ctx, bottom);
    ctx.y = bottom - 15;
  }
  ctx.y -= 4;
}

function totalsBlock(ctx: Ctx) {
  const d = ctx.doc;
  const rows: { k: string; v: string; strong?: boolean; muted?: boolean }[] = [];
  if (d.kind === "quote") {
    const t = d.totals;
    rows.push({ k: "Subtotal", v: usd(t.subtotal) });
    if (t.discountTotal) rows.push({ k: "Discounts included", v: `-${usd(t.discountTotal)}`, muted: true });
    if (t.deliveryFee) rows.push({ k: "Delivery", v: usd(t.deliveryFee) });
    if (t.installFee) rows.push({ k: "Installation and training", v: usd(t.installFee) });
    if (t.taxRate) rows.push({ k: `Tax (${t.taxRate}%)`, v: usd(t.taxAmount) });
    rows.push({ k: "Total due", v: usd(t.total), strong: true });
    if (t.monthlyTotal) rows.push({ k: "Monthly service", v: `${usd(t.monthlyTotal)} / month`, strong: true });
  } else {
    const t = d.totals;
    rows.push({ k: "Subtotal", v: usd(t.subtotal) });
    if (t.taxRate) rows.push({ k: `Tax (${t.taxRate}%)`, v: usd(t.taxAmount) });
    rows.push({ k: "Total", v: usd(t.total) });
    if (t.amountPaid) rows.push({ k: "Paid", v: `-${usd(t.amountPaid)}`, muted: true });
    rows.push({ k: "Balance due", v: usd(t.balanceDue), strong: true });
  }
  const w = 250;
  const x = PAGE_W - MARGIN - w;
  ensure(ctx, rows.length * 18 + 30);
  for (const r of rows) {
    if (r.strong) {
      ctx.page.drawRectangle({ x, y: ctx.y - 7, width: w, height: 22, color: TINT });
    }
    text(ctx, r.k, x + 10, ctx.y, { size: r.strong ? 10.5 : 9.5, bold: r.strong, color: r.muted ? MUTED : INK2 });
    text(ctx, r.v, x, ctx.y, { size: r.strong ? 11.5 : 9.5, bold: r.strong, color: r.strong ? BRAND_DEEP : r.muted ? MUTED : INK, align: "right", width: w - 10 });
    ctx.y -= r.strong ? 24 : 17;
  }
  ctx.y -= 8;
}

function paragraph(ctx: Ctx, title: string, body: string, size = 9) {
  const lines = wrap(body, ctx.font, size, CONTENT_W);
  ensure(ctx, 30 + Math.min(lines.length, 3) * (size + 4));
  text(ctx, title.toUpperCase(), MARGIN, ctx.y, { size: 7.5, bold: true, color: MUTED });
  ctx.y -= 14;
  for (const l of lines) {
    ensure(ctx, size + 6);
    text(ctx, l, MARGIN, ctx.y, { size, color: INK2 });
    ctx.y -= size + 4;
  }
  ctx.y -= 10;
}

export async function renderDocumentPdf(doc: AnyDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.kind === "quote" ? "Quote" : "Invoice"} ${doc.number}`);
  pdf.setAuthor(doc.company.name);
  pdf.setProducer("Spectrum HQ");
  pdf.setCreationDate(new Date());
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { pdf, page: pdf.addPage([PAGE_W, PAGE_H]), y: 0, font, bold, doc, pageNo: 1 };
  ctx.y = header(ctx);
  footer(ctx);
  metaBlock(ctx);

  if (doc.kind === "quote") {
    const oneTime = doc.lines.filter((l) => l.pricingMode !== "MONTHLY");
    const monthly = doc.lines.filter((l) => l.pricingMode === "MONTHLY");
    const showDisc = doc.lines.some((l) => l.discountPct > 0);
    linesTable(ctx, monthly.length ? "One time" : null, oneTime, showDisc, false);
    linesTable(ctx, "Monthly service (Robot as a Service)", monthly, showDisc, true);
  } else {
    linesTable(ctx, null, doc.lines, false, false);
  }
  totalsBlock(ctx);

  if (doc.kind === "quote") {
    if (doc.status === "ACCEPTED" && doc.acceptedByName) {
      ensure(ctx, 30);
      text(ctx, `Accepted by ${doc.acceptedByName} on ${dateFmt(doc.respondedAt)}`, MARGIN, ctx.y, { size: 9.5, bold: true, color: BRAND_DEEP });
      ctx.y -= 22;
    }
    if (doc.notes) paragraph(ctx, "Notes", doc.notes);
    if (doc.terms) paragraph(ctx, "Terms", doc.terms, 8.5);
  } else {
    if (doc.notes) paragraph(ctx, "Notes", doc.notes);
    paragraph(ctx, "How to pay", `Pay online from the link in your email, or send a check or wire to ${doc.company.name}, ${doc.company.address}. Please reference ${doc.number} with your payment. Questions: ${doc.company.email} or ${doc.company.phone}.`, 8.5);
    if (doc.payments.length) {
      ensure(ctx, 20 + doc.payments.length * 14);
      text(ctx, "PAYMENTS", MARGIN, ctx.y, { size: 7.5, bold: true, color: MUTED });
      ctx.y -= 14;
      for (const p of doc.payments) {
        text(ctx, `${dateFmt(p.paidAt)}  ${p.method.toLowerCase().replace("_", " ")}${p.reference ? `  ref ${p.reference}` : ""}`, MARGIN, ctx.y, { size: 9, color: INK2 });
        text(ctx, usd(p.amount), MARGIN, ctx.y, { size: 9, color: INK, align: "right", width: CONTENT_W });
        ctx.y -= 14;
      }
    }
  }
  return pdf.save();
}
