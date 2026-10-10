import { Injectable, inject } from '@angular/core';
import { ClubInput, NewClubInput, PlatformRepository } from '@aura/backend/api';
import { ClubAccount } from '@aura/shared/models';
import { dbError, functionError, toClubAccount } from './mapping';
import { SupabaseClients } from './supabase-clients';

/** Clubs are created and edited by edge functions, which hold the service-role key. */
@Injectable()
export class SupabasePlatformRepository extends PlatformRepository {
  private readonly clients = inject(SupabaseClients);

  async listClubs(): Promise<ClubAccount[]> {
    const { data, error } = await this.clients.platform().rpc('platform_clubs');
    if (error) throw dbError(error, 'Could not load clubs.');
    return data.map(toClubAccount);
  }

  createClub(input: NewClubInput): Promise<ClubAccount> {
    return this.invoke('create-club', input);
  }

  updateClub(id: string, input: Omit<ClubInput, 'slug'>): Promise<ClubAccount> {
    return this.invoke('update-club', { id, ...input });
  }

  private async invoke(fn: string, body: object): Promise<ClubAccount> {
    const { data, error } = await this.clients.platform().functions.invoke<ClubAccount>(fn, { body });
    if (error || !data) throw await functionError(error);
    return data;
  }
}
