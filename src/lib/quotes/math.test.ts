import { describe, expect, it } from "vitest";
import { computeInvoiceTotals, computeQuoteTotals, hasDiscount, lineTotals, maxDiscountPct, paymentStatus, roundCents, totalsFromQuoteRecord } from "./math";

describe("roundCents", () => {
  it("rounds to two decimals and handles float noise", () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(2016.29999)).toBe(2016.3);
    expect(roundCents(NaN)).toBe(0);
  });
});

describe("lineTotals", () => {
  it("applies quantity and discount", () => {
    expect(lineTotals({ quantity: 2, unitPrice: 20000, pricingMode: "ONE_TIME", discountPct: 10 })).toEqual({ gross: 40000, discount: 4000, total: 36000 });
  });
  it("clamps bad input", () => {
    expect(lineTotals({ quantity: -1, unitPrice: 100, pricingMode: "ONE_TIME", discountPct: 250 })).toEqual({ gross: 0, discount: 0, total: 0 });
    expect(lineTotals({ quantity: 1, unitPrice: 100, pricingMode: "ONE_TIME", discountPct: null })).toEqual({ gross: 100, discount: 0, total: 100 });
  });
});

describe("computeQuoteTotals", () => {
  it("matches the seeded FlashBot Max quote", () => {
    const t = computeQuoteTotals({
      lines: [
        { quantity: 1, unitPrice: 20000, pricingMode: "ONE_TIME", discountPct: 0 },
        { quantity: 1, unitPrice: 950, pricingMode: "ONE_TIME", discountPct: 0 },
      ],
      deliveryFee: 990,
      installFee: 2500,
      taxRate: 8.25,
    });
    expect(t.subtotal).toBe(20950);
    expect(t.discountTotal).toBe(0);
    expect(t.taxable).toBe(24440);
    expect(t.taxAmount).toBe(2016.3);
    expect(t.oneTimeTotal).toBe(26456.3);
    expect(t.total).toBe(26456.3);
    expect(t.monthlyTotal).toBe(0);
  });

  it("keeps monthly lines out of the taxable base and reports them separately", () => {
    const t = computeQuoteTotals({
      lines: [
        { quantity: 2, unitPrice: 799, pricingMode: "MONTHLY", discountPct: 0 },
        { quantity: 1, unitPrice: 1500, pricingMode: "ONE_TIME", discountPct: 20 },
      ],
      deliveryFee: 0,
      installFee: 500,
      taxRate: 10,
    });
    expect(t.monthlyTotal).toBe(1598);
    expect(t.subtotal).toBe(1200);
    expect(t.discountTotal).toBe(300);
    expect(t.taxable).toBe(1700);
    expect(t.taxAmount).toBe(170);
    expect(t.total).toBe(1870);
  });

  it("sums discounts across monthly and one time lines", () => {
    const t = computeQuoteTotals({ lines: [{ quantity: 1, unitPrice: 1000, pricingMode: "MONTHLY", discountPct: 5 }, { quantity: 1, unitPrice: 1000, pricingMode: "ONE_TIME", discountPct: 5 }], taxRate: 0 });
    expect(t.discountTotal).toBe(100);
    expect(t.monthlyTotal).toBe(950);
    expect(t.subtotal).toBe(950);
    expect(t.taxAmount).toBe(0);
    expect(t.total).toBe(950);
  });

  it("handles an empty quote", () => {
    const t = computeQuoteTotals({ lines: [] });
    expect(t.total).toBe(0);
    expect(t.lineTotals).toEqual([]);
  });

  it("reads database shaped records with Decimal strings", () => {
    const t = totalsFromQuoteRecord({ lines: [{ quantity: "3", unitPrice: "10.50", pricingMode: "ONE_TIME", discountPct: "0" }], deliveryFee: "5", installFee: null, taxRate: "8.25" });
    expect(t.subtotal).toBe(31.5);
    expect(t.taxable).toBe(36.5);
    expect(t.taxAmount).toBe(3.01);
    expect(t.total).toBe(39.51);
  });
});

describe("discount helpers", () => {
  it("detects discounts", () => {
    expect(hasDiscount({ lines: [{ discountPct: 0 }, { discountPct: "0" }] })).toBe(false);
    expect(hasDiscount({ lines: [{ discountPct: 0 }, { discountPct: "2.5" }] })).toBe(true);
    expect(maxDiscountPct({ lines: [{ discountPct: 5 }, { discountPct: 12 }] })).toBe(12);
  });
});

describe("computeInvoiceTotals", () => {
  it("taxes one time lines only", () => {
    const t = computeInvoiceTotals(
      [
        { quantity: 1, unitPrice: 20000, pricingMode: "ONE_TIME" },
        { quantity: 1, unitPrice: 799, pricingMode: "MONTHLY" },
      ],
      8.25,
    );
    expect(t.subtotal).toBe(20799);
    expect(t.taxable).toBe(20000);
    expect(t.taxAmount).toBe(1650);
    expect(t.total).toBe(22449);
  });
});

describe("paymentStatus", () => {
  it("classifies payments", () => {
    expect(paymentStatus(100, 0)).toBe("UNPAID");
    expect(paymentStatus(100, 40)).toBe("PARTIALLY_PAID");
    expect(paymentStatus(100, 100)).toBe("PAID");
    expect(paymentStatus(100, 100.004)).toBe("PAID");
  });
});
