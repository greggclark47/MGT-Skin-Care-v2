// Web-only adapter: mobile keeps native color values; web resolves shared semantic roles through CSS.
export {space,radius,font,TAP_TARGET_MIN} from '@mgt/shared';
export const color={accent:'var(--violet)',accentHover:'var(--accent-hover)',accentSubtle:'var(--tint)',accentBorder:'var(--accent-border)',text:'var(--text)',textMuted:'var(--muted)',textFaint:'var(--muted)',bg:'var(--panel)',bgSubtle:'var(--surface)',border:'var(--border)',success:'var(--success)',caution:'var(--orange)',cautionSubtle:'var(--caution-bg)',danger:'var(--danger)'} as const;

