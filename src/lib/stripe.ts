// Stripe Checkout for invoice payments. Every function returns { ok: false } when the key is not
// configured so the UI can fall back to wire and check instructions.

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/mailer";
import { roundCents } from "@/lib/quotes/math";

export type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { appInfo: { name: "Spectrum HQ" } });
}

export async function createStripeCheckout(invoiceId: string): Promise<StripeResult<{ url: string; sessionId: string }>> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, error: "Online payments are not set up yet. STRIPE_SECRET_KEY is missing." };
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { company: { select: { name: true, stripeCustomerId: true } }, contact: { select: { email: true } } } });
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (!inv.publicToken) return { ok: false, error: "This invoice has not been sent yet." };
  if (inv.status === "VOID") return { ok: false, error: "This invoice is void." };
  const balance = roundCents(Number(inv.balanceDue));
  if (balance <= 0) return { ok: false, error: "This invoice is already paid." };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(balance * 100), product_data: { name: `Invoice ${inv.number}${inv.title ? `: ${inv.title}` : ""}`, description: `Spectrum Robotics · ${inv.company?.name ?? "Customer"}` } } }],
      metadata: { invoice_id: inv.id, invoice_number: inv.number },
      payment_intent_data: { metadata: { invoice_id: inv.id, invoice_number: inv.number } },
      customer_email: inv.contact?.email ?? undefined,
      success_url: appUrl(`/i/${inv.publicToken}?paid=1`),
      cancel_url: appUrl(`/i/${inv.publicToken}`),
    });
    if (!session.url) return { ok: false, error: "Stripe did not return a checkout link." };
    await prisma.invoice.update({ where: { id: inv.id }, data: { stripeCheckoutSessionId: session.id } });
    return { ok: true, data: { url: session.url, sessionId: session.id } };
  } catch (e) {
    console.error("stripe checkout failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the payment." };
  }
}

export function constructWebhookEvent(rawBody: string, signature: string): StripeResult<Stripe.Event> {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return { ok: false, error: "Stripe webhook is not configured." };
  try {
    return { ok: true, data: stripe.webhooks.constructEvent(rawBody, signature, secret) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid signature." };
  }
}

// Works out whether a completed Checkout Session was paid by card or by bank debit.
export async function paymentMethodForSession(session: Stripe.Checkout.Session): Promise<{ method: "CARD" | "ACH"; paymentIntentId: string | null }> {
  const stripe = stripeClient();
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
  if (!stripe || !piId) return { method: "CARD", paymentIntentId: piId };
  try {
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] });
    const pm = pi.payment_method;
    const type = pm && typeof pm !== "string" ? pm.type : null;
    return { method: type === "us_bank_account" ? "ACH" : "CARD", paymentIntentId: piId };
  } catch {
    return { method: "CARD", paymentIntentId: piId };
  }
}
