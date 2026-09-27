import { Router } from 'express';
import {
  classify, scoreCandidates, buildRoutine,
  type SkinProfileInput, type CandidateProduct, type RoutineSlot, type ScoreResult, type ExclusionResult,
} from '@mgt/domain';
import { ApiError } from '../../middleware/error';
import { saveSession } from './session-store';
import type { CatalogStore } from '../catalog/store';

const ALL_SLOTS: RoutineSlot[] = [
  'cleanser', 'toner', 'serum', 'treatment', 'moisturizer', 'sunscreen',
  'eye', 'exfoliant', 'mask', 'spot', 'face_oil', 'mist', 'body',
];

// POST /api/skin-match/complete — pre-account session (§C.5 "session_token" pattern) or
// authenticated call. Runs the deterministic Stage 1/2/3 pipeline synchronously; narrative
// generation (Stage 4, AI Gateway) is queued separately per Section C.1's async rule.
export function skinMatchRouter(catalog: CatalogStore) {
  const router = Router();

  router.post('/complete', async (req, res, next) => {
    try {
      const { session_id, ...input } = req.body as SkinProfileInput & { session_id?: string };
      if (!input?.skin_type || !input?.concerns?.length) {
        throw new ApiError(400, 'invalid_input', 'skin_type and at least one concern are required.');
      }
      const sessionId = session_id ?? `skm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const classification = classify(input);
      const candidatesBySlot = await catalog.candidatesForSlots(ALL_SLOTS);

      const slotResults = new Map<RoutineSlot, (ScoreResult | ExclusionResult)[]>();
      const ingredientMap = new Map<string, string[]>();
      for (const [slot, products] of Object.entries(candidatesBySlot) as [RoutineSlot, CandidateProduct[]][]) {
        slotResults.set(
          slot,
          scoreCandidates(products, classification.profile_vector, classification.avoid_flags, input.ingredient_avoidances, input.budget_range),
        );
        products.forEach((p) => ingredientMap.set(p.id, p.ingredients));
      }

      const routine = buildRoutine(slotResults, ingredientMap);
      saveSession(sessionId, { classification, routine, slotResults: slotResults as Map<RoutineSlot, ScoreResult[]> });

      res.json({
        session_id: sessionId,
        profile_vector: classification.profile_vector,
        avoid_flags: classification.avoid_flags,
        rules_version: classification.rules_version,
        routine,
        // narrative/blurb fields are filled asynchronously by the ai-jobs worker per Section C.1
        // and delivered via a follow-up GET or a push once ready — never generated inline here.
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
