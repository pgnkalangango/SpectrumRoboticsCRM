import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { constructWebhookEvent, paymentMethodForSession } from "@/lib/stripe";
import { applyPayment } from "@/lib/quotes/core";

export const runtime = "nodejs";

// Stripe posts here. The signature is verified, events are stored once by id, and a paid
// Checkout Session becomes a Payment on the invoice named in its metadata.
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false, error: "Missing signature." }, { status: 400 });
  const raw = await req.text();
  const verified = constructWebhookEvent(raw, signature);
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: 400 });
  const event = verified.data;

  try {
    await prisma.webhookEvent.create({ data: { provider: "stripe", externalId: event.id, type: event.type, payload: JSON.parse(raw) } });
  } catch (e) {
    // Unique violation means we already handled this event.
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") return NextResponse.json({ ok: true, duplicate: true });
    console.error("webhook store failed", e);
    return NextResponse.json({ ok: false, error: "Could not store event." }, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") await settleSession(session);
    }
    await prisma.webhookEvent.update({ where: { externalId: event.id }, data: { processed: true } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Processing failed.";
    console.error("stripe webhook failed", e);
    await prisma.webhookEvent.update({ where: { externalId: event.id }, data: { error: message } }).catch(() => null);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function settleSession(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) return;
  const amount = (session.amount_total ?? 0) / 100;
  if (amount <= 0) return;
  const { method, paymentIntentId } = await paymentMethodForSession(session);
  await applyPayment({ invoiceId, amount, method, reference: paymentIntentId ?? session.id, paidAt: new Date(), stripePaymentIntentId: paymentIntentId ?? session.id, actorLabel: "Stripe" });
}
