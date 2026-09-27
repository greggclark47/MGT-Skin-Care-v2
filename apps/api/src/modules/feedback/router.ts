import { Router } from 'express';
import { applyFeedback, type FeedbackSignal } from '@mgt/domain';
import { getSession, saveSession } from '../skin-match/session-store';
import { ApiError } from '../../middleware/error';

// Feedback capture -> skin_profile_versions(reason='feedback') -> re-score (Section H SC-P4).
// This route applies the deterministic nudge and re-saves the session; the caller is
// responsible for re-running scoreCandidates/buildRoutine against the updated vector if a
// fresh routine is wanted (kept as a separate step so a feedback capture doesn't silently
// rebuild someone's routine without a UI confirmation).
export function feedbackRouter() {
  const router = Router();

  router.post('/:sessionId/signal', (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const signals = req.body.signals as FeedbackSignal[];
      if (!Array.isArray(signals) || signals.length === 0) {
        throw new ApiError(400, 'invalid_input', 'signals must be a non-empty array.');
      }
      const session = getSession(sessionId);
      if (!session) throw new ApiError(404, 'session_not_found', `No skin match session ${sessionId}.`);

      const result = applyFeedback(session.classification.profile_vector, signals);
      saveSession(sessionId, {
        ...session,
        classification: { ...session.classification, profile_vector: result.profile_vector },
      });

      res.json({
        profile_vector: result.profile_vector,
        triggers_avoid_flag_review: result.triggers_avoid_flag_review,
        version_reason: result.version_reason,
      });
    } catch (err) { next(err); }
  });

  return router;
}
