import { Router } from 'express';
import { generateReferralCode, redeemReferral, DEFAULT_REFERRAL_POLICY, type ReferralRedemption } from '@mgt/domain';
import { ApiError } from '../../middleware/error';

// SC-P5 "referral program live" (Section H). Credit ledger persistence is a CREATE item for
// the real `referral_rewards` table (Section 0.4 REUSE row, rebuilt against the pure engine);
// this in-memory ledger proves the abuse-cap arithmetic end to end first.
const creditedThisMonth = new Map<string, number>(); // referrer_user_id -> cents credited this month
const codesByUser = new Map<string, string>();

export function referralRouter() {
  const router = Router();

  router.post('/code', (req, res, next) => {
    try {
      const { user_id } = req.body as { user_id: string };
      if (!user_id) throw new ApiError(400, 'invalid_input', 'user_id is required.');
      let code = codesByUser.get(user_id);
      if (!code) {
        code = generateReferralCode(user_id);
        codesByUser.set(user_id, code);
      }
      res.json({ code });
    } catch (err) { next(err); }
  });

  router.post('/redeem', (req, res, next) => {
    try {
      const redemption = req.body as ReferralRedemption;
      if (!redemption.referrer_user_id || !redemption.referee_user_id || !redemption.code || !redemption.order_id) {
        throw new ApiError(400, 'invalid_input', 'referrer_user_id, referee_user_id, code, and order_id are required.');
      }
      const priorCredit = creditedThisMonth.get(redemption.referrer_user_id) ?? 0;
      const result = redeemReferral(redemption, DEFAULT_REFERRAL_POLICY, priorCredit);

      const referrerEntry = result.entries.find((e) => e.reason === 'referral_referrer_credit');
      if (referrerEntry) {
        creditedThisMonth.set(redemption.referrer_user_id, priorCredit + referrerEntry.amount_cents);
      }

      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
