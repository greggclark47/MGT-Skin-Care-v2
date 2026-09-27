import { Router } from 'express';
import { estimateRunOut, applyReplenishmentAction, type UsageEstimateInput, type ReplenishmentAction } from '@mgt/domain';
import { ApiError } from '../../middleware/error';

// One-tap reorder/delay/skip/cancel (Section H SC-P4). Real implementation persists the
// resulting next_check_at onto the routine step's replenishment_predictions row (Section J);
// this in-memory version proves the state machine before that table is wired.
const replenishmentState = new Map<string, { usage: UsageEstimateInput; delayDays?: number }>();

export function replenishmentRouter() {
  const router = Router();

  router.post('/estimate', (req, res, next) => {
    try {
      const usage = req.body as UsageEstimateInput & { step_id: string };
      if (!usage.step_id || !usage.size_ml || !usage.frequency_per_week || !usage.ml_per_use || !usage.purchased_at) {
        throw new ApiError(400, 'invalid_input', 'step_id, size_ml, frequency_per_week, ml_per_use, and purchased_at are required.');
      }
      replenishmentState.set(usage.step_id, { usage });
      const estimate = estimateRunOut(usage);
      res.json({ estimate });
    } catch (err) { next(err); }
  });

  router.post('/:stepId/action', (req, res, next) => {
    try {
      const { stepId } = req.params;
      const { action, delay_days } = req.body as { action: ReplenishmentAction; delay_days?: number };
      const state = replenishmentState.get(stepId);
      if (!state) throw new ApiError(404, 'step_not_found', `No replenishment tracking for step ${stepId}.`);
      const estimate = estimateRunOut(state.usage);
      const decision = applyReplenishmentAction(action, estimate, delay_days);
      res.json({ decision });
    } catch (err) { next(err); }
  });

  return router;
}
