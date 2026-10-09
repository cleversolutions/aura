import { Injectable, inject } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import {
  AuthRepository,
  ClubSession,
  DemoAccount,
  DemoClub,
  DirectoryRepository,
  SignInInput,
} from '@aura/backend/api';
import { Club, PlatformAdmin } from '@aura/shared/models';
import { authEmailFor } from '@aura/shared/util';
import { PreviewData } from './preview';
import { SupabaseClients } from './supabase-clients';

const WRONG_CLUB_LOGIN = 'That username and password don’t match an account at this club.';

function toClubSession(session: Session): ClubSession {
  return {
    userId: String(session.user.app_metadata['member_id'] ?? ''),
    mustChangePassword: !!session.user.user_metadata['must_change_password'],
  };
}

function toPlatformAdmin(session: Session | null): PlatformAdmin | null {
  const user = session?.user;
  if (!user || user.app_metadata['role'] !== 'platform_admin') return null;
  return { id: user.id, name: String(user.user_metadata['name'] ?? user.email ?? ''), email: user.email ?? '' };
}

/**
 * Club members sign in with an identity derived from the club id and their username
 * (authEmailFor), so the same username at two clubs is two accounts. The platform admin signs in
 * with their real email on a separate client.
 */
@Injectable()
export class SupabaseAuthRepository extends AuthRepository {
  private readonly clients = inject(SupabaseClients);
  private readonly directory = inject(DirectoryRepository);
  private readonly preview = inject(PreviewData);

  private async club(slug: string): Promise<Club> {
    const club = await this.directory.findClub(slug);
    if (!club) throw new Error('No club at this link.');
    return club;
  }

  async useClub(slug: string): Promise<void> {
    const club = await this.club(slug);
    this.preview.stop();
    this.clients.activate(club);
  }

  async session(): Promise<ClubSession | null> {
    if (this.clients.previewing) return { userId: this.preview.userId, mustChangePassword: false };
    const session = await this.clients.session();
    return session ? toClubSession(session) : null;
  }

  async signIn({ clubSlug, username, password }: SignInInput): Promise<ClubSession> {
    const club = await this.club(clubSlug);
    const client = this.clients.forClub(clubSlug);
    const email = await authEmailFor(club.id, username, this.clients.config.loginDomain);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      if (error && error.code !== 'invalid_credentials') console.error(error);
      throw new Error(
        error?.code === 'invalid_credentials' || !error ? WRONG_CLUB_LOGIN : 'Could not sign in. Try again.',
      );
    }
    if (data.session.user.app_metadata['club_id'] !== club.id) {
      await client.auth.signOut({ scope: 'local' });
      throw new Error(WRONG_CLUB_LOGIN);
    }
    this.preview.stop();
    this.clients.activate(club);
    return toClubSession(data.session);
  }

  async changePassword(newPassword: string): Promise<void> {
    if (newPassword.length < 8) throw new Error('Use at least 8 characters.');
    const { client } = this.clients.active();
    if (!(await this.clients.session())) throw new Error('Sign in again to change your password.');
    const { error } = await client.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
    if (error) {
      if (error.code === 'same_password') throw new Error('Choose a password different from the temporary one.');
      if (error.code === 'weak_password') throw new Error('Choose a stronger password.');
      console.error(error);
      throw new Error('Could not change your password. Try again.');
    }
    const accepted = await client.rpc('accept_invite');
    if (accepted.error) console.error(accepted.error);
    this.clients.changed();
  }

  async signOut(): Promise<void> {
    const { client } = this.clients.active();
    await client.auth.signOut({ scope: 'local' });
    this.clients.changed();
  }

  demoAccounts(): DemoAccount[] {
    return [];
  }

  signInAs(): Promise<void> {
    return Promise.reject(new Error('Demo accounts are only available with the mock backend.'));
  }

  demoClubs(): DemoClub[] {
    return [];
  }

  async platformSession(): Promise<PlatformAdmin | null> {
    const { data } = await this.clients.platform().auth.getSession();
    return toPlatformAdmin(data.session);
  }

  async signInPlatform(email: string, password: string): Promise<PlatformAdmin> {
    const client = this.clients.platform();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    const admin = toPlatformAdmin(data.session);
    if (error || !admin) {
      if (data.session) await client.auth.signOut({ scope: 'local' });
      throw new Error('Wrong email or password.');
    }
    return admin;
  }

  async signOutPlatform(): Promise<void> {
    await this.clients.platform().auth.signOut({ scope: 'local' });
    if (this.clients.previewing) {
      this.preview.stop();
      this.clients.previewing = false;
      this.clients.changed();
    }
  }

  async usePreview(slug: string): Promise<void> {
    if (!(await this.platformSession())) throw new Error('Only the platform admin can preview clubs.');
    const club = await this.club(slug);
    this.preview.start(club);
    this.clients.previewing = true;
    this.clients.changed();
  }
}
