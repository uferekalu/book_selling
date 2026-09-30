/**
 * Email brand colours: a copy of frontend/src/styles/tokens.css light values (emails can't read
 * CSS variables). Keep in step with the token file when the palette changes. Web fonts are
 * unreliable in mail clients, so type falls back to classic serif/sans stacks.
 */
export const emailTheme = {
  color: {
    background: '#f7f2ea',
    surface: '#ffffff',
    border: '#ede5d8',
    text: '#24160d',
    textMuted: '#66594b',
    textSubtle: '#7f6e59',
    primary: '#6f4527',
    onPrimary: '#ffffff',
    accent: '#b88a2c',
    accentSubtle: '#fbf7ea',
    onAccentSubtle: '#784f21',
    danger: '#b42318',
    dangerSubtle: '#fdecea',
  },
  font: {
    display: "Georgia, 'Times New Roman', Times, serif",
    body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'SFMono-Regular', Menlo, Consolas, monospace",
  },
} as const;

/** Values every template needs, filled in by the renderer from config. */
export interface EmailBrand {
  name: string;
  siteUrl: string;
  supportEmail?: string;
  postalAddress?: string;
}
