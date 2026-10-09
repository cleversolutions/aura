import { Injectable, InjectionToken, inject } from '@angular/core';
import { ClubSession } from '@aura/backend/api';
import { PlatformAdmin } from '@aura/shared/models';
import { CLOCK } from '@aura/shared/util';
import { DEMO_PLATFORM_ADMIN, MockClub, SPARTANS_SLUG, createMockClubs } from './clubs';
import { MockData, createSeed } from './seed';

export interface MockBackendOptions {
  /** Simulated network latency in ms. */
  latencyMs: number;
  /** Delay before a simulated reply arrives after you post a message. 0 disables replies. */
  replyDelayMs: number;
  /** The active club when the app starts. */
  initialClub: string;
  /** Who is signed in to `initialClub` when the app starts; null starts signed out. */
  initialUserId: string | null;
  /** Start with the platform admin signed in. */
  platformSignedIn: boolean;
}

const DEFAULT_OPTIONS: MockBackendOptions = {
  latencyMs: 150,
  replyDelayMs: 1800,
  initialClub: SPARTANS_SLUG,
  initialUserId: 'jordan',
  platformSignedIn: false,
};

export const MOCK_BACKEND_OPTIONS = new InjectionToken<MockBackendOptions>('MOCK_BACKEND_OPTIONS', {
  providedIn: 'root',
  factory: () => DEFAULT_OPTIONS,
});

export function mockBackendOptions(options: Partial<MockBackendOptions>): MockBackendOptions {
  return { ...DEFAULT_OPTIONS, ...options };
}

/** In-memory stand-in for the database. Lives for the page session only. */
@Injectable({ providedIn: 'root' })
export class MockDb {
  readonly options = inject(MOCK_BACKEND_OPTIONS);
  readonly now = inject(CLOCK);
  readonly clubs: MockClub[] = createMockClubs(this.now());

  /** Slug of the club the app is working in. */
  activeSlug = this.options.initialClub;
  /** Club sessions by slug, like a real client's per-club session storage. */
  readonly sessions = new Map<string, ClubSession>(
    this.options.initialUserId
      ? [[this.options.initialClub, { userId: this.options.initialUserId, mustChangePassword: false }]]
      : [],
  );
  platformAdmin: PlatformAdmin | null = this.options.platformSignedIn ? DEMO_PLATFORM_ADMIN : null;
  /** Sample data shown under another club's branding while the platform admin previews it. */
  preview: { club: MockClub; session: ClubSession } | null = null;
  private seq = 0;

  findClub(slug: string): MockClub | undefined {
    return this.clubs.find((c) => c.account.slug === slug);
  }

  /** The active club (or the preview stand-in). */
  get club(): MockClub {
    if (this.preview) return this.preview.club;
    const club = this.findClub(this.activeSlug);
    if (!club) throw new Error(`No club at /${this.activeSlug}.`);
    return club;
  }

  get data(): MockData {
    return this.club.data;
  }

  startPreview(account: MockClub['account']): void {
    const data = createSeed(this.now());
    this.preview = {
      club: { account, data, credentials: [], adminUserId: 'sam', demoAccounts: [] },
      session: { userId: 'sam', mustChangePassword: false },
    };
    this.activeSlug = account.slug;
  }

  nextId(prefix: string): string {
    return `${prefix}${Date.now().toString(36)}${++this.seq}`;
  }

  /** Resolves with a deep copy after the simulated latency, so callers never share state with the db. */
  respond<T>(value: T): Promise<T> {
    const copy = structuredClone(value);
    const ms = this.options.latencyMs;
    return ms > 0 ? new Promise((resolve) => setTimeout(() => resolve(copy), ms)) : Promise.resolve(copy);
  }

  /** Rejects after the simulated latency. */
  fail(message: string): Promise<never> {
    const ms = this.options.latencyMs;
    const error = new Error(message);
    return ms > 0 ? new Promise((_, reject) => setTimeout(() => reject(error), ms)) : Promise.reject(error);
  }
}
