/**
 * Typed `var()` accessors for the rare consumer that can't use a Tailwind utility (inline SVG
 * fills, canvas drawing in the reader, motion values). Values live in tokens.css; this file only
 * names them, so a typo is a compile error instead of a silently-missing colour.
 */

const v = (name: string) => `var(--${name})` as const;

export const color = {
  background: v("color-background"),
  surface: v("color-surface"),
  surfaceRaised: v("color-surface-raised"),
  surfaceSunken: v("color-surface-sunken"),
  overlay: v("color-overlay"),
  border: v("color-border"),
  borderStrong: v("color-border-strong"),
  text: v("color-text"),
  textMuted: v("color-text-muted"),
  primary: v("color-primary"),
  onPrimary: v("color-on-primary"),
  accent: v("color-accent"),
  success: v("color-success"),
  warning: v("color-warning"),
  danger: v("color-danger"),
  info: v("color-info"),
  focusRing: v("color-focus-ring"),
} as const;

export const zIndex = {
  base: v("z-base"),
  sticky: v("z-sticky"),
  header: v("z-header"),
  dropdown: v("z-dropdown"),
  drawer: v("z-drawer"),
  modal: v("z-modal"),
  popover: v("z-popover"),
  toast: v("z-toast"),
  tooltip: v("z-tooltip"),
} as const;

/** Durations in milliseconds, mirrored from tokens.css for JS timers and motion props. */
export const durationMs = { fast: 120, base: 200, slow: 320 } as const;

/** Cubic-bezier easing arrays for `motion`, mirrored from tokens.css. */
export const easing = {
  outSoft: [0.22, 1, 0.36, 1],
  inOutSoft: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;

/** Tailwind v4 default breakpoints (unchanged). Mobile-first: styles apply from this width up. */
export const breakpoint = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 } as const;
