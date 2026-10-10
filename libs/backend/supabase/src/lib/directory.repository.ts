import { Injectable, inject } from '@angular/core';
import {
  Directory,
  DirectoryRepository,
  InviteMemberInput,
  LinkPlayerInput,
  MemberInvite,
  SaveTeamInput,
  SaveTeamResult,
  UpdateMemberInput,
  AddPlayerInput,
  AddPlayerResult,
  UpdateProfileInput,
} from '@aura/backend/api';
import { Club, PlayerProfile, User } from '@aura/shared/models';
import {
  PROFILE_SELECT,
  dbError,
  functionError,
  teamIdFor,
  toClub,
  toDirectory,
  toMemberInvite,
  toProfile,
  toUserResult,
} from './mapping';
import { PreviewData } from './preview';
import { SupabaseClients } from './supabase-clients';

@Injectable()
export class SupabaseDirectoryRepository extends DirectoryRepository {
  private readonly clients = inject(SupabaseClients);
  private readonly preview = inject(PreviewData);

  async findClub(slug: string): Promise<Club | null> {
    const { data, error } = await this.clients.anon().from('club_public').select().eq('slug', slug).maybeSingle();
    if (error) throw dbError(error, 'Could not reach the club. Check your connection.');
    return data ? toClub(data) : null;
  }

  manifestUrl(slug: string): string | null {
    return this.clients.config.clubManifests ? `/${slug}/manifest.webmanifest` : null;
  }

  async load(): Promise<Directory> {
    if (this.clients.previewing) return this.preview.directory.load();
    const { club, client } = this.clients.active();
    const [clubRow, teams, members, profiles] = await Promise.all([
      client.from('clubs').select().eq('id', club.id).single(),
      client.from('teams').select('id, name').eq('club_id', club.id).order('id'),
      client.from('members').select('*, team_members(team_id)').eq('club_id', club.id).order('name'),
      client.from('player_profiles').select(PROFILE_SELECT).eq('club_id', club.id).order('name'),
    ]);
    for (const r of [clubRow, teams, members, profiles])
      if (r.error) throw dbError(r.error, 'Could not load the club.');
    return toDirectory(toClub(clubRow.data!), teams.data!, members.data!, profiles.data!);
  }

  async inviteMember(input: InviteMemberInput): Promise<MemberInvite> {
    if (this.clients.previewing) return this.preview.directory.inviteMember(input);
    const { data, error } = await this.clients.active().client.functions.invoke('invite-member', { body: input });
    if (error) throw await functionError(error);
    return toMemberInvite(data);
  }

  /** Not atomic: the team, its staff and any new staff invite are separate writes, in that order. */
  async saveTeam(input: SaveTeamInput): Promise<SaveTeamResult> {
    if (this.clients.previewing) return this.preview.directory.saveTeam(input);
    const { club, client } = this.clients.active();
    let teamId = input.id;
    if (!teamId) {
      const name = (input.name ?? '').trim();
      teamId = teamIdFor(name);
      const created = await client.from('teams').insert({ club_id: club.id, id: teamId, name });
      if (created.error?.code === '23505') throw new Error(`${name} already exists.`);
      if (created.error) throw dbError(created.error, 'Could not create the team.');
    }

    const staff = await client
      .from('team_members')
      .select('member_id, members!inner(kind)')
      .eq('club_id', club.id)
      .eq('team_id', teamId)
      .eq('members.kind', 'staff');
    if (staff.error) throw dbError(staff.error);
    const current = new Set(staff.data.map((r) => r.member_id));
    const wanted = new Set(input.staffIds);
    const removed = [...current].filter((id) => !wanted.has(id));
    const added = [...wanted].filter((id) => !current.has(id));
    if (removed.length) {
      const { error } = await client.from('team_members').delete().eq('team_id', teamId).in('member_id', removed);
      if (error) throw dbError(error, 'Could not update the team staff.');
    }
    if (added.length) {
      const { error } = await client
        .from('team_members')
        .insert(added.map((member_id) => ({ club_id: club.id, team_id: teamId, member_id })));
      if (error) throw dbError(error, 'Could not update the team staff.');
    }

    const invite = input.newStaff ? await this.inviteMember({ team: teamId, kind: 'staff', ...input.newStaff }) : null;
    return { directory: await this.load(), invite };
  }

  /** Through an edge function: the email is the sign-in username, so its auth identity moves with it. */
  async updateMember(input: UpdateMemberInput): Promise<User> {
    if (this.clients.previewing) return this.preview.directory.updateMember(input);
    const { data, error } = await this.clients.active().client.functions.invoke('update-member', { body: input });
    if (error) throw await functionError(error);
    return toUserResult(data);
  }

  async cancelInvite(userId: string): Promise<void> {
    if (this.clients.previewing) return this.preview.directory.cancelInvite(userId);
    const { error } = await this.clients
      .active()
      .client.functions.invoke('manage-invite', { body: { id: userId, action: 'cancel' } });
    if (error) throw await functionError(error);
  }

  async resendInvite(userId: string): Promise<MemberInvite> {
    if (this.clients.previewing) return this.preview.directory.resendInvite(userId);
    const { data, error } = await this.clients
      .active()
      .client.functions.invoke('manage-invite', { body: { id: userId, action: 'resend' } });
    if (error) throw await functionError(error);
    return toMemberInvite(data);
  }

  async updateProfile(input: UpdateProfileInput): Promise<PlayerProfile> {
    if (this.clients.previewing) return this.preview.directory.updateProfile(input);
    const { data, error } = await this.clients
      .active()
      .client.from('player_profiles')
      .update({ name: input.name, jersey: input.jersey, login: input.login })
      .eq('id', input.id)
      .select(PROFILE_SELECT)
      .single();
    if (error) throw dbError(error, 'Could not save the player.');
    return toProfile(data);
  }

  async requestPlayerLink(input: LinkPlayerInput): Promise<PlayerProfile> {
    if (this.clients.previewing) return this.preview.directory.requestPlayerLink(input);
    const { data, error } = await this.clients
      .active()
      .client.rpc('request_player_link', { p_team: input.team, p_name: input.name, p_jersey: input.jersey });
    if (error) throw dbError(error, 'Could not send the request.');
    return this.profile(data);
  }

  /** Invites the player first when they sign in themselves, then adds them with their parents. */
  async addPlayer(input: AddPlayerInput): Promise<AddPlayerResult> {
    if (this.clients.previewing) return this.preview.directory.addPlayer(input);
    const invite = input.email
      ? await this.inviteMember({ team: input.team, kind: 'player', name: input.name, email: input.email })
      : null;
    const { data, error } = await this.clients.active().client.rpc('add_player', {
      p_team: input.team,
      p_name: input.name,
      p_jersey: input.jersey,
      p_parents: input.parentIds,
      // The generated types say string; the function takes null for a player without a sign-in.
      p_user_member: (invite?.user.id ?? null) as string,
    });
    if (error) {
      if (invite) await this.cancelInvite(invite.user.id).catch(() => undefined);
      throw dbError(error, 'Could not add the player.');
    }
    return { profile: await this.profile(data), invite };
  }

  async setPlayerParents(profileId: string, parentIds: string[]): Promise<PlayerProfile> {
    if (this.clients.previewing) return this.preview.directory.setPlayerParents(profileId, parentIds);
    const { error } = await this.clients
      .active()
      .client.rpc('set_player_parents', { p_profile: profileId, p_parents: parentIds });
    if (error) throw dbError(error, 'Could not save the player’s parents.');
    return this.profile(profileId);
  }

  private async profile(id: string): Promise<PlayerProfile> {
    const { data, error } = await this.clients
      .active()
      .client.from('player_profiles')
      .select(PROFILE_SELECT)
      .eq('id', id)
      .single();
    if (error) throw dbError(error);
    return toProfile(data);
  }
}
