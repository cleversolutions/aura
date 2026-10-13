import { Injectable, inject } from '@angular/core';
import { ClubInput, MemberInvite, NewClubInput, PlatformRepository } from '@aura/backend/api';
import { ClubAccount, ClubStaffMember } from '@aura/shared/models';
import { dbError, functionError, toClubAccount, toClubStaffMember, toMemberInvite } from './mapping';
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

  async listClubStaff(clubId: string): Promise<ClubStaffMember[]> {
    const { data, error } = await this.clients.platform().rpc('platform_club_staff', { p_club: clubId });
    if (error) throw dbError(error, 'Could not load the club’s staff.');
    return data.map(toClubStaffMember);
  }

  setClubAdmin(clubId: string, memberId: string): Promise<ClubAccount> {
    return this.invoke('update-club', { id: clubId, adminMemberId: memberId });
  }

  setArchived(clubId: string, archived: boolean): Promise<ClubAccount> {
    return this.invoke('update-club', { id: clubId, archived });
  }

  async resetAdminPassword(clubId: string): Promise<MemberInvite> {
    const { data, error } = await this.clients
      .platform()
      .functions.invoke('manage-member', { body: { club: clubId, action: 'reset-password' } });
    if (error || !data) throw await functionError(error);
    return toMemberInvite(data);
  }

  private async invoke(fn: string, body: object): Promise<ClubAccount> {
    const { data, error } = await this.clients.platform().functions.invoke<ClubAccount>(fn, { body });
    if (error || !data) throw await functionError(error);
    return data;
  }
}
