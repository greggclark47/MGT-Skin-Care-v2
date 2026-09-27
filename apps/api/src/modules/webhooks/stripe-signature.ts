// Real Stripe signature verification (SC-P1 TODO closed out). This is the seam that turns
// the `/webhooks/stripe` route from "trusts whatever JSON shows up" into "trusts only bytes
// Stripe actually signed with our webhook secret."
//
// Fails CLOSED: if STRIPE_WEBHOOK_SECRET is not configured, verification throws rather than
// silently accepting the payload — an unsigned webhook endpoint is worse than a rejected one.
// The one exception is explicit local dev, gated by STRIPE_SKIP_SIGNATURE_VERIFICATION=1,
// which is loud (logs a warning on every call) and never set in any deployed environment.

import Stripe from 'stripe';

export interface VerifiedEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> } & Record<string, unknown>;
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export function verifyStripeWebhook(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  opts: { secret?: string; skipVerification?: boolean; stripe?: Stripe } = {},
): VerifiedEvent {
  const secret = opts.secret ?? process.env.STRIPE_WEBHOOK_SECRET;
  const skip = opts.skipVerification ?? process.env.STRIPE_SKIP_SIGNATURE_VERIFICATION === '1';

  if (skip) {
    // eslint-disable-next-line no-console
    console.warn(
      '[webhooks/stripe] STRIPE_SKIP_SIGNATURE_VERIFICATION=1 — accepting an UNVERIFIED ' +
      'webhook payload. This must never be set outside local dev.',
    );
    const parsed = JSON.parse(rawBody.toString('utf8') || '{}');
    return parsed as VerifiedEvent;
  }

  if (!secret) {
    throw new WebhookSignatureError(
      'STRIPE_WEBHOOK_SECRET is not configured — refusing to process an unverifiable webhook. ' +
      'Set STRIPE_SKIP_SIGNATURE_VERIFICATION=1 only for local dev.',
    );
  }
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    throw new WebhookSignatureError('Missing stripe-signature header.');
  }

  const stripe = opts.stripe ?? new Stripe('sk_placeholder_not_used_for_verification');
  try {
    // constructEvent only uses the secret + header + raw body — no live API call, no real key
    // needed for verification itself.
    const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
    return event as unknown as VerifiedEvent;
  } catch (err) {
    // Wrap the SDK's own error (e.g. a bad/tampered/expired signature) so every failure mode
    // this function can produce is a WebhookSignatureError the caller can map to one 400 —
    // never an uncaught SDK exception that falls through to a 500.
    const message = err instanceof Error ? err.message : String(err);
    throw new WebhookSignatureError(`Stripe signature verification failed: ${message}`);
  }
}
