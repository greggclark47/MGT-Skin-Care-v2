import { Router } from 'express';
import type { ScoreResult, RoutineSlot, Routine } from '@mgt/domain';
import { parseIntent, applyIntent } from './routine-commands';
import { ApiError } from '../../middleware/error';

// POST /api/coach/routine-command — deterministic per Section C.4; see routine-commands.ts
// header comment for why this never calls an LLM to mutate the routine itself.
export function coachRouter(
  getRoutine: (sessionId: string) => Routine | undefined,
  getAlternatives: (sessionId: string) => Map<RoutineSlot, ScoreResult[]>,
  priceLookup: (productId: string) => number,
) {
  const router = Router();

  router.post('/routine-command', (req, res, next) => {
    try {
      const { session_id, text } = req.body as { session_id: string; text: string };
      if (!session_id || !text) throw new ApiError(400, 'invalid_input', 'session_id and text are required.');

      const routine = getRoutine(session_id);
      if (!routine) throw new ApiError(404, 'routine_not_found', `No routine for session ${session_id}.`);

      const intent = parseIntent(text);
      if (!intent) {
        // Falls through to the AI Gateway's `coach_answer` task for a general question —
        // not this deterministic path. SC-P3 wires that call; here we report the miss plainly.
        return res.status(422).json({ error: { code: 'intent_not_recognized', message: 'Could not match a routine command; route to coach_answer instead.', request_id: (req as any).requestId } });
      }

      const result = applyIntent(intent, routine, getAlternatives(session_id), priceLookup);
      res.json(result);
    } catch (err) { next(err); }
  });

  return router;
}
