import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key);
}

export async function POST(req: NextRequest) {
  try {
    const { priceId, productId, successUrl, cancelUrl } = await req.json();
    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: 'usd',
                unit_amount: 499,
                product_data: {
                  name: 'Procedural Graphic Download',
                  description: `Asset ID: ${productId}`,
                },
              },
              quantity: 1,
            },
          ],
      mode: priceId ? 'subscription' : 'payment',
      success_url: successUrl ?? `${appUrl}/marketplace?success=1`,
      cancel_url: cancelUrl ?? `${appUrl}/marketplace`,
      metadata: { productId: productId ?? '' },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
