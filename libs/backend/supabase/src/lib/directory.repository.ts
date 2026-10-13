import { Injectable, inject } from '@angular/core';
import {
  Directory,
  DirectoryRepository,
  InviteMemberInput,
  LinkPlayerInput,
  MemberInvite,
  SaveTeamInput,
  SaveTeamResult,
  SeasonRoster,
  StartSeasonInput,
  UpdateMemberInput,
  AddPlayerInput,
  AddPlayerResult,
  UpdateProfileInput,
} from '@aura/backend/api';
import { Club, ClubSettings, PlayerProfile, SeasonId, TeamId, TeamRole, User } from '@aura/shared/models';
import {
  MEMBER_SELECT,
  PROFILE_SELECT,
  SEASON_SELECT,
  TEAM_SELECT,
  dbError,
  functionError,
  seasonFromTrigger,
  toClub,
  toDirectory,
  toMemberInvite,
  toProfile,
  toSettings,
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
    const [clubRow, seasons, teams, members, contacts, profiles, settings] = await Promise.all([
      client.from('clubs').select().eq('id', club.id).single(),
      client.from('seasons').select(SEASON_SELECT).eq('club_id', club.id).order('started_at'),
      client.from('teams').select(TEAM_SELECT).eq('club_id', club.id).order('name'),
      client.from('members').select(MEMBER_SELECT).eq('club_id', club.id).order('name'),
      client.rpc('member_contacts'),
      client.from('player_profiles').select(PROFILE_SELECT).eq('club_id', club.id).order('name'),
      client.from('club_settings').select().eq('club_id', club.id).maybeSingle(),
    ]);
    for (const r of [clubRow, seasons, teams, members, contacts, profiles, settings])
      if (r.error) throw dbError(r.error, 'Could not load the club.');
    return toDirectory(
      clubRow.data!,
      seasons.data!,
      teams.data!,
      members.data!,
      contacts.data!,
      profiles.data!,
      settings.data,
    );
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
    const name = input.name.trim();
    const details = { name, age: input.age || null, division: input.division || null };
    // New teams get a generated id and the current season (teams_season trigger).
    const saved = input.id
      ? await client.from('teams').update(details).eq('club_id', club.id).eq('id', input.id).select('id').single()
      : await client
          .from('teams')
          .insert(seasonFromTrigger({ club_id: club.id, ...details }))
          .select('id')
          .single();
    if (saved.error?.code === '23505') throw new Error(`${name} already exists this season.`);
    if (saved.error) throw dbError(saved.error, 'Could not save the team.');
    const teamId = saved.data.id;

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

  async deleteTeam(teamId: TeamId): Promise<Directory> {
    if (this.clients.previewing) return this.preview.directory.deleteTeam(teamId);
    const { error } = await this.clients.active().client.rpc('delete_team', { p_team: teamId });
    if (error) throw dbError(error, 'Could not delete the team.');
    return this.load();
  }

  async startSeason(input: StartSeasonInput): Promise<Directory> {
    if (this.clients.previewing) return this.preview.directory.startSeason(input);
    const teams = input.teams.map((t) => ({ ...t, age: t.age ?? null, division: t.division ?? null }));
    const { error } = await this.clients.active().client.rpc('start_season', { p_name: input.name, p_teams: teams });
    if (error) throw dbError(error, 'Could not start the season.');
    return this.load();
  }

  async loadSeason(seasonId: SeasonId): Promise<SeasonRoster> {
    if (this.clients.previewing) return this.preview.directory.loadSeason(seasonId);
    const { club, client } = this.clients.active();
    const teams = await client.from('teams').select('id').eq('club_id', club.id).eq('season_id', seasonId);
    if (teams.error) throw dbError(teams.error, 'Could not load the season.');
    const ids = teams.data.map((t) => t.id);
    const [members, profiles] = await Promise.all([
      client.from('past_team_members').select('team_id, member_id').eq('club_id', club.id).in('team_id', ids),
      client.from('player_profiles').select(PROFILE_SELECT).eq('club_id', club.id).in('team_id', ids).order('name'),
    ]);
    if (members.error) throw dbError(members.error, 'Could not load the season.');
    if (profiles.error) throw dbError(profiles.error, 'Could not load the season.');
    const byTeam: SeasonRoster['members'] = Object.fromEntries(ids.map((id) => [id, []]));
    for (const m of members.data) byTeam[m.team_id].push(m.member_id);
    return { members: byTeam, profiles: profiles.data.filter((p) => !p.pending).map(toProfile) };
  }

  /** Through an edge function: the email is the sign-in username, so its auth identity moves with it. */
  async updateMember(input: UpdateMemberInput): Promise<User> {
    if (this.clients.previewing) return this.preview.directory.updateMember(input);
    const { data, error } = await this.clients.active().client.functions.invoke('update-member', { body: input });
    if (error) throw await functionError(error);
    return toUserResult(data);
  }

  async setMemberTitle(userId: string, title: string): Promise<User> {
    if (this.clients.previewing) return this.preview.directory.setMemberTitle(userId, title);
    const { data, error } = await this.clients
      .active()
      .client.functions.invoke('update-member', { body: { id: userId, title } });
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

  resetPassword(userId: string): Promise<MemberInvite> {
    if (this.clients.previewing) return this.preview.directory.resetPassword(userId);
    return this.manageMember(userId, 'reset-password').then(toMemberInvite);
  }

  setMemberDisabled(userId: string, disabled: boolean): Promise<User> {
    if (this.clients.previewing) return this.preview.directory.setMemberDisabled(userId, disabled);
    return this.manageMember(userId, disabled ? 'disable' : 'enable').then(toUserResult);
  }

  setMemberRole(userId: string, kind: TeamRole): Promise<User> {
    if (this.clients.previewing) return this.preview.directory.setMemberRole(userId, kind);
    return this.manageMember(userId, 'role', { kind }).then(toUserResult);
  }

  async removeMember(userId: string): Promise<void> {
    if (this.clients.previewing) return this.preview.directory.removeMember(userId);
    await this.manageMember(userId, 'delete');
  }

  private async manageMember(id: string, action: string, extra: Record<string, string> = {}): Promise<unknown> {
    const { data, error } = await this.clients
      .active()
      .client.functions.invoke('manage-member', { body: { id, action, ...extra } });
    if (error) throw await functionError(error);
    return data;
  }

  async updateProfile(input: UpdateProfileInput): Promise<PlayerProfile> {
    if (this.clients.previewing) return this.preview.directory.updateProfile(input);
    const { club, client } = this.clients.active();
    if (input.care) {
      const care = await client.from('player_care').upsert({
        club_id: club.id,
        profile_id: input.id,
        emergency_contact: input.care.emergencyContact.trim(),
        medical_notes: input.care.medicalNotes.trim(),
      });
      if (care.error) throw dbError(care.error, 'Could not save the player’s care details.');
    }
    const { data, error } = await client
      .from('player_profiles')
      .update({ name: input.name, jersey: input.jersey })
      .eq('id', input.id)
      .select(PROFILE_SELECT)
      .single();
    if (error) throw dbError(error, 'Could not save the player.');
    return toProfile(data);
  }

  async setMemberTeams(userId: string, teams: TeamId[]): Promise<User> {
    if (this.clients.previewing) return this.preview.directory.setMemberTeams(userId, teams);
    const { error } = await this.clients.active().client.rpc('set_member_teams', { p_member: userId, p_teams: teams });
    if (error) throw dbError(error, 'Could not change their teams.');
    const user = (await this.load()).users.find((u) => u.id === userId);
    if (!user) throw new Error('Member not found.');
    return user;
  }

  async approvePlayer(profileId: string): Promise<PlayerProfile> {
    if (this.clients.previewing) return this.preview.directory.approvePlayer(profileId);
    const { error } = await this.clients.active().client.rpc('approve_player', { p_profile: profileId });
    if (error) throw dbError(error, 'Could not approve the player.');
    return this.profile(profileId);
  }

  async removePlayer(profileId: string): Promise<void> {
    if (this.clients.previewing) return this.preview.directory.removePlayer(profileId);
    const { error } = await this.clients.active().client.rpc('remove_player', { p_profile: profileId });
    if (error) throw dbError(error, 'Could not remove the player.');
  }

  async movePlayer(profileId: string, team: TeamId): Promise<Directory> {
    if (this.clients.previewing) return this.preview.directory.movePlayer(profileId, team);
    const { error } = await this.clients.active().client.rpc('move_player', { p_profile: profileId, p_team: team });
    if (error) throw dbError(error, 'Could not move the player.');
    return this.load();
  }

  /** invite-member creates the player's sign-in and links it to their profile. */
  async givePlayerSignIn(profileId: string, email: string): Promise<MemberInvite> {
    if (this.clients.previewing) return this.preview.directory.givePlayerSignIn(profileId, email);
    const profile = await this.profile(profileId);
    const { data, error } = await this.clients.active().client.functions.invoke('invite-member', {
      body: { kind: 'player', team: profile.team, name: profile.name, email, profile: profileId },
    });
    if (error) throw await functionError(error);
    return toMemberInvite(data);
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

  async saveSettings(settings: ClubSettings): Promise<ClubSettings> {
    if (this.clients.previewing) return this.preview.directory.saveSettings(settings);
    const { club, client } = this.clients.active();
    const { data, error } = await client
      .from('club_settings')
      .upsert({ club_id: club.id, announcements: settings.announcements, contacts: settings.contacts })
      .select()
      .single();
    if (error) throw dbError(error, 'Could not save the club settings.');
    return toSettings(data);
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
