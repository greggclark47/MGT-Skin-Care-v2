import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { SkinMatchStep } from '../components/SkinMatchStep';
import { CORE_STEPS, progress, toProfileInput, color, radius, space, type AnswerState } from '@mgt/shared';
import type { SkinProfileInput } from '@mgt/domain';

export interface SkinMatchScreenProps {
  onComplete: (input: SkinProfileInput, durationMs: number) => void;
  onStepCompleted?: (stepIndex: number) => void;
}

export function SkinMatchScreen({ onComplete, onStepCompleted }: SkinMatchScreenProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [begunAt] = useState(() => Date.now());

  const handleAnswer = useCallback((stepId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
  }, []);

  const handleNext = useCallback(() => {
    onStepCompleted?.(index);
    if (index === CORE_STEPS.length - 1) {
      onComplete(toProfileInput(answers), Date.now() - begunAt);
      return;
    }
    setIndex((i) => i + 1);
  }, [index, answers, begunAt, onComplete, onStepCompleted]);

  const p = progress(answers);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View accessibilityRole="progressbar" accessibilityValue={{ now: p.percent, min: 0, max: 100 }}
            style={styles.track}>
        <View style={[styles.fill, { width: `${p.percent}%` }]} />
      </View>
      <SkinMatchStep
        step={CORE_STEPS[index]} stepIndex={index} totalSteps={CORE_STEPS.length}
        answers={answers} onAnswer={handleAnswer} onNext={handleNext}
        onBack={() => setIndex((i) => Math.max(0, i - 1))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: space.xl },
  track: { height: 4, marginHorizontal: space.lg, backgroundColor: color.border, borderRadius: radius.pill },
  fill: { height: '100%', backgroundColor: color.accent, borderRadius: radius.pill },
});
