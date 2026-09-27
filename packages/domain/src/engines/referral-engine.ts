export const REFERRAL_ENGINE_VERSION = '1.0.0';

// Referral codes + credits (Section 0.4 "Referral codes + credits + user dashboard" row,
// REUSE from Phase 5/6 — reimplemented here as a pure, testable engine so the growth-loop
// arithmetic isn't buried in a route handler). SC-P5 "referral program live" task.

export interface ReferralCreditPolicy {
  referrer_credit_cents: number;   // credited to the person who referred
  referee_discount_cents: number;  // discount applied to the referred person's first order
  max_referrer_credit_cents_per_month: number; // abuse-prevention cap
}

export const DEFAULT_REFERRAL_POLICY: ReferralCreditPolicy = {
  referrer_credit_cents: 1000,   // $10 credit
  referee_discount_cents: 1000,  // $10 off first order
  max_referrer_credit_cents_per_month: 5000, // caps at 5 successful referrals/month
};

// Deterministic, collision-resistant-enough code from a user id + a monotonic counter — real
// implementation may prefer a DB sequence/uuid slice, but the shape (short, uppercase,
// unambiguous character set) is fixed here so client and server agree without a round trip.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes 0/O/1/I for readability

export function generateReferralCode(seed: string, length = 8): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  let code = '';
  let n = hash;
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[n % CODE_ALPHABET.length];
    n = Math.floor(n / CODE_ALPHABET.length) || (n * 7 + 13) >>> 0; // keep cycling deterministically without repeating the same digit run
  }
  return code;
}

export interface ReferralRedemption {
  referrer_user_id: string;
  referee_user_id: string;
  code: string;
  order_id: string; // the referee's first qualifying order
}

export interface CreditLedgerEntry {
  user_id: string;
  amount_cents: number;
  reason: 'referral_referrer_credit' | 'referral_referee_discount';
  reference_id: string; // order_id or code, for audit trail
}

export interface RedemptionResult {
  entries: CreditLedgerEntry[];
  capped: boolean; // true if the referrer's monthly cap was hit and the credit was reduced/denied
}

export function redeemReferral(
  redemption: ReferralRedemption,
  policy: ReferralCreditPolicy,
  referrerCreditedThisMonthCents: number,
): RedemptionResult {
  const entries: CreditLedgerEntry[] = [
    {
      user_id: redemption.referee_user_id,
      amount_cents: policy.referee_discount_cents,
      reason: 'referral_referee_discount',
      reference_id: redemption.order_id,
    },
  ];

  const remainingCap = policy.max_referrer_credit_cents_per_month - referrerCreditedThisMonthCents;
  const capped = remainingCap <= 0;
  const referrerCredit = capped ? 0 : Math.min(policy.referrer_credit_cents, remainingCap);

  if (referrerCredit > 0) {
    entries.push({
      user_id: redemption.referrer_user_id,
      amount_cents: referrerCredit,
      reason: 'referral_referrer_credit',
      reference_id: redemption.code,
    });
  }

  return { entries, capped: capped && referrerCredit === 0 };
}
