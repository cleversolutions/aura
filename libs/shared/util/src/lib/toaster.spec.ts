import { TestBed } from '@angular/core/testing';
import { Toaster } from './toaster';

describe('Toaster', () => {
  afterEach(() => vi.useRealTimers());

  it('replaces the current message and auto-dismisses', () => {
    vi.useFakeTimers();
    const toaster = TestBed.inject(Toaster);
    toaster.show('First', 1000);
    toaster.show('Second', 1000);
    expect(toaster.message()?.text).toBe('Second');
    vi.advanceTimersByTime(1000);
    expect(toaster.message()).toBeNull();
  });
});
