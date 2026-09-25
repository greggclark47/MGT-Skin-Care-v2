import React from 'react';
import { View, Text, Pressable, StyleSheet, AccessibilityRole } from 'react-native';
import {
  color, radius, space, font, TAP_TARGET_MIN,
  type QuestionStep, type AnswerState, toggleChoice, isStepAnswered,
} from '@mgt/shared';

// The React Native twin of the web step. It imports the SAME questionnaire data and the SAME
// tokens from @mgt/shared — only the rendering primitives differ. That is the whole point of
// Section C.1's "no separate business logic per platform": if a step changes, it changes once.

export interface SkinMatchStepProps {
  step: QuestionStep;
  stepIndex: number;
  totalSteps: number;
  answers: AnswerState;
  onAnswer: (stepId: string, value: string | string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function SkinMatchStep({ step, stepIndex, totalSteps, answers, onAnswer, onNext, onBack }: SkinMatchStepProps) {
  const current = answers[step.id];
  const isSelected = (value: string) => (Array.isArray(current) ? current.includes(value) : current === value);
  const canAdvance = isStepAnswered(step, answers);
  const atCap = step.multi && step.maxSelections !== undefined
    && Array.isArray(current) && current.length >= step.maxSelections;

  return (
    <View testID="skin-match-step" style={styles.container}>
      <Text style={styles.counter}>Step {stepIndex + 1} of {totalSteps}</Text>
      <Text accessibilityRole="header" style={styles.prompt}>{step.prompt}</Text>
      {step.helper ? <Text style={styles.helper}>{step.helper}</Text> : null}

      <View style={styles.choices}>
        {step.choices.map((choice) => {
          const selected = isSelected(choice.value);
          const blocked = !selected && atCap;
          return (
            <Pressable
              key={choice.value}
              testID={`choice-${choice.value}`}
              disabled={blocked}
              accessibilityRole={(step.multi ? 'checkbox' : 'radio') as AccessibilityRole}
              accessibilityState={{ checked: selected, disabled: blocked }}
              accessibilityLabel={choice.hint ? `${choice.label}. ${choice.hint}` : choice.label}
              onPress={() => onAnswer(step.id, toggleChoice(step, current, choice.value))}
              style={[styles.choice, selected && styles.choiceSelected, blocked && styles.choiceBlocked]}
            >
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{choice.label}</Text>
              {choice.hint ? <Text style={styles.choiceHint}>{choice.hint}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        {stepIndex > 0 && (
          <Pressable testID="back" onPress={onBack} accessibilityRole="button" style={styles.backButton}>
            <Text style={styles.backLabel}>Back</Text>
          </Pressable>
        )}
        <Pressable testID="next" onPress={onNext} disabled={!canAdvance} accessibilityRole="button"
          accessibilityState={{ disabled: !canAdvance }}
          style={[styles.nextButton, !canAdvance && styles.nextButtonDisabled]}>
          <Text style={[styles.nextLabel, !canAdvance && styles.nextLabelDisabled]}>
            {stepIndex === totalSteps - 1 ? 'See my routine' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg },
  counter: { color: color.textFaint, fontSize: font.size.sm, marginBottom: space.xs },
  prompt: { fontSize: font.size.xl, fontWeight: '600', color: color.text },
  helper: { color: color.textMuted, fontSize: font.size.sm, marginTop: space.sm },
  choices: { marginTop: space.lg, gap: space.sm },
  choice: {
    minHeight: TAP_TARGET_MIN, justifyContent: 'center', padding: space.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: color.border, backgroundColor: color.bg,
  },
  choiceSelected: { borderColor: color.accent, backgroundColor: color.accentSubtle },
  choiceBlocked: { opacity: 0.45 },
  choiceLabel: { fontSize: font.size.md, color: color.text },
  choiceLabelSelected: { fontWeight: '600' },
  choiceHint: { fontSize: font.size.sm, color: color.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  backButton: {
    minHeight: TAP_TARGET_MIN, justifyContent: 'center', paddingHorizontal: space.lg,
    borderRadius: radius.pill, borderWidth: 1, borderColor: color.border,
  },
  backLabel: { fontSize: font.size.md, color: color.text },
  nextButton: {
    flex: 1, minHeight: TAP_TARGET_MIN, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.pill, backgroundColor: color.accent,
  },
  nextButtonDisabled: { backgroundColor: color.border },
  nextLabel: { fontSize: font.size.md, fontWeight: '600', color: '#fff' },
  nextLabelDisabled: { color: color.textFaint },
});
