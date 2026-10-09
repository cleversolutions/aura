import { Injectable, InjectionToken, inject } from '@angular/core';
import { CLOCK } from '@aura/shared/util';
import { MockData, createSeed } from './seed';

export interface MockBackendOptions {
  /** Simulated network latency in ms. */
  latencyMs: number;
  /** Delay before a simulated reply arrives after you post a message. 0 disables replies. */
  replyDelayMs: number;
  /** Who is signed in when the app starts. */
  initialUserId: string;
}

export const MOCK_BACKEND_OPTIONS = new InjectionToken<MockBackendOptions>('MOCK_BACKEND_OPTIONS', {
  providedIn: 'root',
  factory: () => ({ latencyMs: 150, replyDelayMs: 1800, initialUserId: 'jordan' }),
});

/** In-memory stand-in for the database. Lives for the page session only. */
@Injectable({ providedIn: 'root' })
export class MockDb {
  readonly options = inject(MOCK_BACKEND_OPTIONS);
  readonly now = inject(CLOCK);
  readonly data: MockData = createSeed(this.now());
  private seq = 0;

  nextId(prefix: string): string {
    return `${prefix}${Date.now().toString(36)}${++this.seq}`;
  }

  /** Resolves with a deep copy after the simulated latency, so callers never share state with the db. */
  respond<T>(value: T): Promise<T> {
    const copy = structuredClone(value);
    const ms = this.options.latencyMs;
    return ms > 0 ? new Promise((resolve) => setTimeout(() => resolve(copy), ms)) : Promise.resolve(copy);
  }
}
