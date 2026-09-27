import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ProductExplanation } from '@mgt/domain';
import { color, radius, space, font } from '@mgt/shared';

// The E.6 explanation contract on mobile. Same rule as web: deterministic reasons first,
// AI blurb clearly labelled and entirely optional. Reason humanisation is shared logic —
// duplicating that mapping is how the two platforms drift apart.
export const REASON_COPY: Record<string, string> = {
  'targets:primary_concern': 'Targets the concern you picked first',
  'fits:skin_type': 'Suits your skin type',
  'fits:budget': 'Within your budget range',
  'brand:preferred': 'From a brand you already like',
};
export function humanizeReason(code: string): string {
  return REASON_COPY[code] ?? code.replace(/[:_]/g, ' ');
}

export function ProductExplanationCard({ explanation, productName }: { explanation: ProductExplanation; productName: string }) {
  const compat = {
    safe: { label: 'Suitable for your sensitivity', bg: color.accentSubtle, fg: color.success },
    caution: { label: 'Introduce slowly', bg: color.cautionSubtle, fg: color.caution },
    excluded: { label: 'Not recommended for you', bg: '#FEF2F2', fg: color.danger },
  }[explanation.sensitivity_compatibility];

  return (
    <View testID="product-explanation" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{productName}</Text>
        <Text testID="match-score" accessibilityLabel={`Match score ${explanation.match_score} out of 100`} style={styles.score}>
          {explanation.match_score}% match
        </Text>
      </View>

      <Text style={styles.placement}>
        {explanation.routine_placement.slot} · {explanation.routine_placement.time.toUpperCase().replace('_', '/')} · {explanation.routine_placement.frequency.replace(/_/g, ' ')}
      </Text>

      <View testID="why-matched" style={styles.reasons}>
        {explanation.why_matched.map((r) => (
          <Text key={r} style={styles.reason}>• {humanizeReason(r)}</Text>
        ))}
      </View>

      {explanation.ingredients.length > 0 && (
        <Text style={styles.ingredients}>
          Key ingredients: {explanation.ingredients.map((i) => `${i.name} (${i.role})`).join(', ')}
        </Text>
      )}

      <Text testID="compatibility" style={[styles.compat, { backgroundColor: compat.bg, color: compat.fg }]}>
        {compat.label}
      </Text>

      {explanation.cautions.map((c) => (
        <Text key={c} testID="caution" style={styles.caution}>{c}</Text>
      ))}

      {explanation.blurb ? (
        <View testID="ai-blurb" style={styles.blurbWrap}>
          <Text style={styles.blurb}>{explanation.blurb}</Text>
          <Text style={styles.blurbLabel}>AI-written summary</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: color.border, borderRadius: radius.lg, padding: space.lg, backgroundColor: color.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  name: { flex: 1, fontSize: font.size.lg, fontWeight: '600', color: color.text },
  score: { fontSize: font.size.sm, fontWeight: '600', color: color.accent, backgroundColor: color.accentSubtle,
           borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2, overflow: 'hidden' },
  placement: { fontSize: font.size.sm, color: color.textMuted, marginTop: space.xs, textTransform: 'capitalize' },
  reasons: { marginTop: space.md, gap: 2 },
  reason: { fontSize: font.size.sm, color: color.text },
  ingredients: { fontSize: font.size.sm, color: color.textMuted, marginTop: space.md },
  compat: { alignSelf: 'flex-start', marginTop: space.md, fontSize: font.size.sm,
            borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, overflow: 'hidden' },
  caution: { marginTop: space.sm, fontSize: font.size.sm, color: color.caution },
  blurbWrap: { marginTop: space.md, borderLeftWidth: 2, borderLeftColor: color.accentBorder, paddingLeft: space.md },
  blurb: { fontSize: font.size.sm, color: color.textMuted, fontStyle: 'italic' },
  blurbLabel: { fontSize: font.size.xs, color: color.textFaint, marginTop: space.xs },
});
