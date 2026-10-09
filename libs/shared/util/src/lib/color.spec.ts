import { contrastLevel, contrastRatio, mixHex, normalizeHex, themeTokens } from './color';
import { SLUG_PATTERN, randomSlug, temporaryPassword } from './codes';

describe('colour helpers', () => {
  it('normalizes hex input', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex(' 1d2a6b ')).toBe('#1d2a6b');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('navy')).toBeNull();
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastLevel(contrastRatio('#767676', '#ffffff'))).toBe('pass');
    expect(contrastLevel(3.2)).toBe('large');
    expect(contrastLevel(2)).toBe('fail');
  });

  it('mixes colours', () => {
    expect(mixHex('#ffffff', '#000000', 0)).toBe('#ffffff');
    expect(mixHex('#ffffff', '#000000', 1)).toBe('#000000');
  });

  it('reproduces the built-in tokens for black on white', () => {
    expect(themeTokens({ ink: '#000000', paper: '#ffffff' })).toEqual({
      '--color-ink': '#000000',
      '--color-paper': '#ffffff',
      '--color-pressed': '#ededed',
      '--color-subtle': '#6b6b6b',
    });
  });
});

describe('codes', () => {
  it('generates link slugs and temporary passwords', () => {
    const slug = randomSlug();
    expect(slug).toMatch(/^[a-km-np-z2-9]{6}$/);
    expect(SLUG_PATTERN.test(slug)).toBe(true);
    expect(temporaryPassword()).toMatch(/^[A-Z]{4}-[a-z2-9]{4}-[2-9]{2}$/);
  });
});
