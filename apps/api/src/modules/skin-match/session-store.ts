import type { Routine, ScoreResult, RoutineSlot, ClassificationResult } from '@mgt/domain';

// Holds the deterministic output of a completed Skin Match per session, so downstream modules
// (cart, coach) can reference "the routine for this session" without recomputing it. SC-P3's
// real `skin_match_sessions` / `recommendations` tables (Section J) persist the same shape;
// this in-memory store is the dev/test seam.
export interface SkinMatchSession {
  classification: ClassificationResult;
  routine: Routine;
  slotResults: Map<RoutineSlot, ScoreResult[]>;
}

const sessions = new Map<string, SkinMatchSession>();

export function saveSession(sessionId: string, session: SkinMatchSession): void {
  sessions.set(sessionId, session);
}

export function getSession(sessionId: string): SkinMatchSession | undefined {
  return sessions.get(sessionId);
}
