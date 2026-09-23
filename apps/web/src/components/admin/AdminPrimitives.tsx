import React from 'react';
import { color, font, radius, space, TAP_TARGET_MIN } from '../theme-tokens';
import type { KnowledgeStatus } from '@mgt/domain';

// Shared chrome for the admin console. Presentational only -- no fetching, no state -- so
// every screen below can be asserted with renderToStaticMarkup the same way the consumer
// components are.

// Status is the whole point of this console, so it gets one colour vocabulary used
// everywhere. `approved` is the only state that means "the AI can use this", and it is the
// only one in success green; everything else is visibly not-live.
const STATUS_STYLE: Record<KnowledgeStatus, { fg: string; bg: string; label: string }> = {
  draft:     { fg: color.textMuted, bg: color.bgSubtle,      label: 'Draft' },
  in_review: { fg: color.caution,   bg: color.cautionSubtle, label: 'In review' },
  approved:  { fg: color.success,   bg: 'var(--success-bg)',           label: 'Approved · live' },
  retired:   { fg: color.danger,    bg: 'var(--danger-bg)',           label: 'Retired' },
};

export function StatusPill({ status }: { status: KnowledgeStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: radius.pill,
      fontSize: font.size.xs, fontWeight: font.weight.semibold,
      color: s.fg, background: s.bg, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

export function Panel({ title, subtitle, tone = 'default', children }: {
  title?: string;
  subtitle?: string;
  tone?: 'default' | 'live' | 'proposed' | 'alarm';
  children?: React.ReactNode;
}) {
  const toneStyle = {
    default:  { border: color.border,       bg: color.bg },
    live:     { border: 'var(--success)',          bg: 'var(--success-bg)' },
    proposed: { border: color.accentBorder, bg: color.accentSubtle },
    alarm:    { border: 'var(--danger)',          bg: 'var(--danger-bg)' },
  }[tone];

  return (
    <section style={{
      border: `1px solid ${toneStyle.border}`, background: toneStyle.bg,
      borderRadius: radius.md, padding: space.lg, marginBottom: space.lg,
    }}>
      {title && (
        <h2 style={{
          margin: 0, fontSize: font.size.sm, fontWeight: font.weight.semibold,
          textTransform: 'uppercase', letterSpacing: '0.06em', color: color.textMuted,
        }}>{title}</h2>
      )}
      {subtitle && (
        <p style={{ margin: `${space.xs}px 0 0`, fontSize: font.size.sm, color: color.textMuted }}>{subtitle}</p>
      )}
      {(title || subtitle) && <div style={{ height: space.md }} />}
      {children}
    </section>
  );
}

// An action that is unavailable says WHY, in place, rather than vanishing. On this console the
// reason is usually a separation-of-duties rule (a superadmin cannot approve safety content),
// and a button that silently disappears teaches nobody that the rule exists.
export function GatedButton({ label, onClick, disabledReason, variant = 'primary', busy }: {
  label: string;
  onClick?: () => void;
  disabledReason?: string | null;
  variant?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
}) {
  const disabled = Boolean(disabledReason) || Boolean(busy);
  const palette = {
    primary:   { bg: color.accent, fg: '#FFFFFF', border: color.accent },
    secondary: { bg: color.bg,     fg: color.text, border: color.border },
    danger:    { bg: color.bg,     fg: color.danger, border: 'var(--danger)' },
  }[variant];

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: space.xs }}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabledReason ?? undefined}
        style={{
          minHeight: TAP_TARGET_MIN, padding: `0 ${space.lg}px`, borderRadius: radius.sm,
          fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: disabled ? color.bgSubtle : palette.bg,
          color: disabled ? color.textFaint : palette.fg,
          border: `1px solid ${disabled ? color.border : palette.border}`,
        }}
      >{busy ? 'Working…' : label}</button>
      {disabledReason && (
        <span style={{ fontSize: font.size.xs, color: color.textMuted, maxWidth: 260 }}>{disabledReason}</span>
      )}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: space.md }}>
      <span style={{ display: 'block', fontSize: font.size.sm, fontWeight: font.weight.medium, marginBottom: space.xs }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: font.size.xs, color: color.textMuted, marginTop: space.xs }}>{hint}</span>}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: TAP_TARGET_MIN,
  padding: `0 ${space.md}px`, borderRadius: radius.sm,
  border: `1px solid ${color.border}`, fontSize: font.size.md, fontFamily: font.family,
  color: color.text, background: color.bg,
};

export function ErrorNote({ error }: { error: { code: string; message: string } | null }) {
  if (!error) return null;
  return (
    <div role="alert" style={{
      border: `1px solid var(--danger)`, background: 'var(--danger-bg)', color: color.danger,
      borderRadius: radius.sm, padding: space.md, marginBottom: space.md, fontSize: font.size.sm,
    }}>
      <strong style={{ fontWeight: font.weight.semibold }}>{error.code}</strong> — {error.message}
    </div>
  );
}

// The audit trail is rendered as evidence, not as a log dump: actor, what changed, when.
export function AuditTrail({ entries }: { entries: Array<{ actor_id: string; action: string; created_at: string }> }) {
  if (entries.length === 0) {
    return <p style={{ fontSize: font.size.sm, color: color.textMuted, margin: 0 }}>No recorded actions yet.</p>;
  }
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {entries.map((e, i) => (
        <li key={`${e.action}-${i}`} style={{
          display: 'flex', gap: space.md, alignItems: 'baseline',
          padding: `${space.sm}px 0`,
          borderTop: i === 0 ? 'none' : `1px solid ${color.border}`,
          fontSize: font.size.sm,
        }}>
          <code style={{ fontSize: font.size.xs, color: color.accent }}>{e.action}</code>
          <span style={{ color: color.textMuted }}>by {e.actor_id}</span>
          <span style={{ color: color.textFaint, marginLeft: 'auto', fontSize: font.size.xs }}>
            {new Date(e.created_at).toISOString().replace('T', ' ').slice(0, 19)}
          </span>
        </li>
      ))}
    </ol>
  );
}
