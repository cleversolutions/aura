import { InjectionToken } from '@angular/core';

/** Source of "now". Override in tests to pin the date. */
export const CLOCK = new InjectionToken<() => Date>('CLOCK', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
