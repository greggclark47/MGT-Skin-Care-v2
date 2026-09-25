'use client';
import React from 'react';
import { color, radius, space, font, TAP_TARGET_MIN } from './theme-tokens';
import { type QuestionStep, type AnswerState, toggleChoice, isStepAnswered } from '@mgt/shared';

export interface SkinMatchStepProps {
  step: QuestionStep;
  stepIndex: number;
  totalSteps: number;
  answers: AnswerState;
  onAnswer: (stepId: string, value: string | string[]) => void;
  onNext: () => void;
  onBack: () => void;
  nextLabel?: string;
}

export function SkinMatchStep({ step, stepIndex, totalSteps, answers, onAnswer, onNext, onBack, nextLabel }: SkinMatchStepProps) {
  const current = answers[step.id];
  const selected = (value: string) => Array.isArray(current) ? current.includes(value) : current === value;
  const canAdvance = isStepAnswered(step, answers);
  const atCap = step.multi && step.maxSelections !== undefined
    && Array.isArray(current) && current.length >= step.maxSelections;

  return (
    <section aria-labelledby="step-prompt" data-testid="skin-match-step">
      <p style={{ color: color.textFaint, fontSize: font.size.sm, marginBottom: space.xs }}>
        Step {stepIndex + 1} of {totalSteps}
      </p>
      <h2 id="step-prompt" tabIndex={-1} style={{ fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.text, margin: 0 }}>
        {step.prompt}
      </h2>
      {step.helper && (
        <p style={{ color: color.textMuted, fontSize: font.size.sm, marginTop: space.sm }}>{step.helper}</p>
      )}

      <div role={step.multi ? 'group' : 'radiogroup'} aria-label={step.prompt}
           style={{ display: 'grid', gap: space.sm, marginTop: space.lg }}>
        {step.choices.map((choice, choiceIndex) => {
          const isSelected = selected(choice.value);
          // A choice past the selection cap is disabled rather than hidden, so the user can
          // see it exists and understands why it won't take — silently ignoring a tap reads
          // as a broken button.
          const blocked = !isSelected && atCap;
          return (
            <button
              key={choice.value}
              type="button"
              role={step.multi ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              tabIndex={step.multi || isSelected || (!current && choiceIndex === 0) ? 0 : -1}
              onKeyDown={event => {
                if(step.multi) return;
                let next = choiceIndex;
                if(event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (choiceIndex + 1) % step.choices.length;
                else if(event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (choiceIndex + step.choices.length - 1) % step.choices.length;
                else if(event.key === 'Home') next = 0;
                else if(event.key === 'End') next = step.choices.length - 1;
                else return;
                event.preventDefault();
                onAnswer(step.id, step.choices[next].value);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
              }}
              disabled={blocked}
              data-testid={`choice-${choice.value}`}
              onClick={() => onAnswer(step.id, toggleChoice(step, current, choice.value))}
              style={{
                minHeight: TAP_TARGET_MIN, textAlign: 'left', cursor: blocked ? 'not-allowed' : 'pointer',
                padding: `${space.md}px`, borderRadius: radius.md,
                border: `1px solid ${isSelected ? color.accent : color.border}`,
                background: isSelected ? color.accentSubtle : color.bg,
                opacity: blocked ? 0.45 : 1,
                fontFamily: font.family, fontSize: font.size.md, color: color.text,
              }}
            >
              <span style={{ fontWeight: isSelected ? font.weight.semibold : font.weight.regular }}>{choice.label}</span>
              {choice.hint && (
                <span style={{ display: 'block', color: color.textMuted, fontSize: font.size.sm, marginTop: 2 }}>
                  {choice.hint}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: space.sm, marginTop: space.xl }}>
        {stepIndex > 0 && (
          <button type="button" onClick={onBack} data-testid="back"
            style={{ minHeight: TAP_TARGET_MIN, padding: `0 ${space.lg}px`, borderRadius: radius.pill,
                     border: `1px solid ${color.border}`, background: color.bg, color: color.text,
                     fontFamily: font.family, fontSize: font.size.md, cursor: 'pointer' }}>
            Back
          </button>
        )}
        <button type="button" onClick={onNext} disabled={!canAdvance} data-testid="next"
          style={{ flex: 1, minHeight: TAP_TARGET_MIN, borderRadius: radius.pill, border: 'none',
                   background: canAdvance ? color.accent : color.border,
                   color: canAdvance ? '#fff' : color.textFaint,
                   fontFamily: font.family, fontSize: font.size.md, fontWeight: font.weight.semibold,
                   cursor: canAdvance ? 'pointer' : 'not-allowed' }}>
          {nextLabel || (stepIndex === totalSteps - 1 ? 'See my routine' : 'Continue')}
        </button>
      </div>
    </section>
  );
}
