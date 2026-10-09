import { TestBed } from '@angular/core/testing';
import { Viewport, WIDE_QUERY } from './viewport';

describe('Viewport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is compact when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(TestBed.inject(Viewport).wide()).toBe(false);
  });

  it('follows the wide media query', () => {
    let listener: ((e: { matches: boolean }) => void) | undefined;
    const matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: (_: string, fn: typeof listener) => (listener = fn),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);

    const viewport = TestBed.inject(Viewport);
    expect(matchMedia).toHaveBeenCalledWith(WIDE_QUERY);
    expect(viewport.wide()).toBe(true);
    listener?.({ matches: false });
    expect(viewport.wide()).toBe(false);
  });
});
