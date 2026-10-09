/** A club's two app colours: `ink` replaces black (text, borders, buttons), `paper` replaces white. */
export interface ThemeColors {
  ink: string;
  paper: string;
}

export const DEFAULT_THEME: ThemeColors = { ink: '#000000', paper: '#ffffff' };

/** `#abc`, `abc`, `#AABBCC` → `#aabbcc`; anything else → null. */
export function normalizeHex(input: string): string | null {
  let h = input.trim();
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9a-f]{3}$/i.test(h)) h = `#${[...h.slice(1)].map((c) => c + c).join('')}`;
  return /^#[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null;
}

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex(rgb: readonly number[]): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `pass`: fine for all text (≥ 4.5). `large`: large text only (≥ 3). `fail`: hard to read. */
export function contrastLevel(ratio: number): 'pass' | 'large' | 'fail' {
  return ratio >= 4.5 ? 'pass' : ratio >= 3 ? 'large' : 'fail';
}

/** Linear blend from `a` (t = 0) to `b` (t = 1). */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

/**
 * CSS custom properties for a club theme, matching the tokens in shared/ui theme.css.
 * With the default black and white they reproduce the built-in values.
 */
export function themeTokens({ ink, paper }: ThemeColors): Record<string, string> {
  return {
    '--color-ink': ink,
    '--color-paper': paper,
    '--color-pressed': mixHex(paper, ink, 0.07),
    '--color-subtle': mixHex(paper, ink, 0.58),
  };
}
