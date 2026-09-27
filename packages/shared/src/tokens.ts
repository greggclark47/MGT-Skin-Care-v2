// Design system tokens (blueprint Section G.5). ONE token file consumed by web and mobile —
// Section 0.3 conflict C10 found five competing accent colours across the Sept 3-6 lineage
// (pink #E75480, #FF69B4, rose, violet #7C3AED, indigo #6366f1). C10 is decided: violet.
// Anything that needs a colour imports it from here; no literal hex in a component.

export const color = {
  // Primary accent — locked decision C10 (2026-09-05).
  accent:        '#7C3AED',
  accentHover:   '#6D28D9',
  accentSubtle:  '#F5F3FF',
  accentBorder:  '#DDD6FE',

  text:          '#18181B',
  textMuted:     '#52525B',
  textFaint:     '#A1A1AA',
  bg:            '#FFFFFF',
  bgSubtle:      '#FAFAFA',
  border:        '#E4E4E7',

  // Semantic. `caution` is deliberately amber, not red: an ingredient caution in the
  // explanation contract is guidance, not a medical warning, and red reads as alarm —
  // exactly the diagnostic tone the compliance position (Section A.3) avoids.
  success:       '#059669',
  caution:       '#D97706',
  cautionSubtle: '#FFFBEB',
  danger:        '#DC2626',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const font = {
  family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 36 },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
} as const;

// Minimum tap target — 44px is the accessibility floor for the mobile Skin Match steps.
export const TAP_TARGET_MIN = 44;
