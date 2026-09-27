'use client';
import React, { useState, useCallback } from 'react';
import { SkinMatchStep } from './SkinMatchStep';
import { CORE_STEPS, type AnswerState, progress, toProfileInput } from '@mgt/shared';
import { color, space, radius, font } from './theme-tokens';
import type { SkinProfileInput } from '@mgt/domain';

export interface SkinMatchFlowProps {
  onComplete: (input: SkinProfileInput, durationMs: number) => void;
  onStepCompleted?: (stepIndex: number) => void;
  startedAt?: number;
}

export function SkinMatchFlow({ onComplete, onStepCompleted, startedAt }: SkinMatchFlowProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [begunAt] = useState(() => startedAt ?? Date.now());

  const handleAnswer = useCallback((stepId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
  }, []);

  const handleNext = useCallback(() => {
    onStepCompleted?.(index);
    if (index === CORE_STEPS.length - 1) {
      // duration_ms is a required property of `skin_match.completed` and the evidence for the
      // <=90s KPI — measured here, at the real boundary, not estimated later.
      onComplete(toProfileInput(answers), Date.now() - begunAt);
      return;
    }
    setIndex((i) => i + 1);
  }, [index, answers, begunAt, onComplete, onStepCompleted]);

  const handleBack = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const p = progress(answers);

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: space.lg, fontFamily: font.family }}>
      <div role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}
           aria-label="Skin Match progress"
           style={{ height: 4, background: color.border, borderRadius: radius.pill, marginBottom: space.xl }}>
        <div style={{ width: `${p.percent}%`, height: '100%', background: color.accent, borderRadius: radius.pill }} />
      </div>
      <SkinMatchStep
        step={CORE_STEPS[index]}
        stepIndex={index}
        totalSteps={CORE_STEPS.length}
        answers={answers}
        onAnswer={handleAnswer}
        onNext={handleNext}
        onBack={handleBack}
      />
    </div>
  );
}
