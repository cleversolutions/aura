import { Injectable, InjectionToken, inject } from '@angular/core';
import { Session, SupabaseClient, createClient } from '@supabase/supabase-js';
import { Club } from '@aura/shared/models';
import { Database } from './database.types';

export interface SupabaseBackendConfig {
  /** Project API URL, e.g. `http://127.0.0.1:54321`. */
  url: string;
  /** The anon (publishable) key. Public by design; row-level security protects the data. */
  anonKey: string;
  /** Domain of the derived club sign-in addresses (see authEmailFor). Must match the edge functions. */
  loginDomain: string;
  /** Whether the host serves `/<slug>/manifest.webmanifest` (the Pages Function); false in local dev. */
  clubManifests: boolean;
}

export const SUPABASE_BACKEND_CONFIG = new InjectionToken<SupabaseBackendConfig>('SUPABASE_BACKEND_CONFIG');

export type AuraClient = SupabaseClient<Database>;

/** Creates a client; replaced in tests to keep sessions in memory. */
export const SUPABASE_CLIENT_FACTORY = new InjectionToken<
  (config: SupabaseBackendConfig, storageKey: string) => AuraClient
>('SUPABASE_CLIENT_FACTORY', {
  providedIn: 'root',
  factory: () => (config, storageKey) =>
    createClient<Database>(config.url, config.anonKey, {
      auth: { storageKey, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    }),
});

/** The active club: where club data is read and written. */
export interface ActiveClub {
  club: Club;
  client: AuraClient;
}

/**
 * One Supabase client per club slug, each storing its session under its own key
 * (`aura-auth-<slug>`), plus one for the platform admin. Installed club apps share storage on one
 * origin, so this keeps a device signed in to several clubs and the admin console at once.
 * Clients are created lazily, and only the active club's client refreshes its token.
 */
@Injectable()
export class SupabaseClients {
  readonly config = inject(SUPABASE_BACKEND_CONFIG);
  private readonly create = inject(SUPABASE_CLIENT_FACTORY);
  private readonly clubs = new Map<string, AuraClient>();
  private platformClient: AuraClient | null = null;
  private publicClient: AuraClient | null = null;
  private current: ActiveClub | null = null;
  private readonly listeners = new Set<() => void>();

  /** The platform admin is previewing a club with sample data (see the repositories). */
  previewing = false;

  forClub(slug: string): AuraClient {
    let client = this.clubs.get(slug);
    if (!client) {
      client = this.create(this.config, `aura-auth-${slug}`);
      void client.auth.stopAutoRefresh();
      this.clubs.set(slug, client);
    }
    return client;
  }

  platform(): AuraClient {
    return (this.platformClient ??= this.create(this.config, 'aura-auth-platform'));
  }

  /** For public reads before signing in. Never signed in. */
  anon(): AuraClient {
    return (this.publicClient ??= createClient<Database>(this.config.url, this.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'aura-auth-public' },
    }));
  }

  /** Makes `club` the active club and its client the one that refreshes its session. */
  activate(club: Club): void {
    const client = this.forClub(club.slug);
    if (this.current?.client !== client) {
      if (this.current) void this.current.client.auth.stopAutoRefresh();
      void client.auth.startAutoRefresh();
    }
    this.current = { club, client };
    this.previewing = false;
    this.changed();
  }

  active(): ActiveClub {
    if (!this.current) throw new Error('No club is open.');
    return this.current;
  }

  activeOrNull(): ActiveClub | null {
    return this.current;
  }

  /** The active club's session, if it belongs to that club. */
  async session(): Promise<Session | null> {
    const { club, client } = this.active();
    const { data } = await client.auth.getSession();
    const session = data.session;
    return session && session.user.app_metadata['club_id'] === club.id ? session : null;
  }

  /** The signed-in member's id in the active club. */
  async memberId(): Promise<string> {
    const session = await this.session();
    const id = session?.user.app_metadata['member_id'];
    if (typeof id !== 'string') throw new Error('Sign in again.');
    return id;
  }

  /** Called whenever the active club, its session or preview mode changes. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(): void {
    this.listeners.forEach((l) => l());
  }
}
