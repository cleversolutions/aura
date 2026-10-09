import { EnvironmentProviders, Provider } from '@angular/core';
import { CLOCK } from '@aura/shared/util';
import { MockBackendOptions } from './mock-db';
import { provideMockBackend } from './provide-mock-backend';

/** Fixed "now" for tests; the seed's dates are relative to it. */
export const TEST_NOW = new Date('2026-10-05T12:00:00');

/** Mock backend with no latency, no simulated replies and a pinned clock. */
export function provideTestBackend(options: Partial<MockBackendOptions> = {}): (Provider | EnvironmentProviders)[] {
  return [
    provideMockBackend({ latencyMs: 0, replyDelayMs: 0, ...options }),
    { provide: CLOCK, useValue: () => new Date(TEST_NOW) },
  ];
}
