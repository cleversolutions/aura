import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import {
  AddPlayerForm,
  AddPlayerValue,
  CopiedValue,
  ExistingMemberValue,
  InviteForm,
  InviteFormValue,
  InviteKind,
  InvitedRow,
  MemberInvited,
  MemberInvitedVm,
  DetailFieldVm,
  PersonDetails,
  PersonDetailsValue,
  PersonDetailsVm,
  ParentOptionVm,
  PersonRowVm,
  PlayerRow,
  PlayerRowVm,
  StaffRow,
} from '@aura/club/ui';
import { PlayerProfile, TeamId, User } from '@aura/shared/models';
import { AppHeader, Chips, Choice } from '@aura/shared/ui';
import { KIND_GROUP, Submission, Toaster, errorMessage, isClubWide } from '@aura/shared/util';

/** A new member's sign-in, as the store returns it. */
type MemberInvite = Awaited<ReturnType<ClubStore['resendInvite']>>;

const KIND_LABEL = { staff: 'Team Staff', parent: 'Parent', player: 'Player', club: 'Club Staff' } as const;
const INVITE_KINDS: InviteKind[] = ['parent', 'player', 'staff'];

function disabledNote(u: User): string {
  return u.disabled ? ' · disabled' : '';
}

/** Roster tab container: picks the team and builds staff, player and invite lists. */
@Component({
  selector: 'aura-roster-page',
  imports: [AppHeader, Chips, StaffRow, PlayerRow, InvitedRow, InviteForm, MemberInvited, PersonDetails, AddPlayerForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <aura-app-header [clubName]="club.club()?.name ?? ''" [logoUrl]="club.club()?.logoUrl" title="Roster" />

    <main class="min-h-0 flex-1 overflow-y-auto">
      @if (selected(); as teamId) {
        <div class="flex max-w-[1100px] flex-col gap-3 px-3.5 pt-3.5 pb-6 wide:p-6">
          @if (tabs().length > 1) {
            <aura-chips
              class="-mx-3.5 px-3.5 wide:mx-0 wide:px-0"
              [scroll]="true"
              [options]="tabs()"
              [value]="teamId"
              (valueChange)="selectedTeam.set($event)"
            />
          }
          <div class="flex items-center justify-between">
            <h1 class="font-display text-2xl font-bold uppercase">{{ club.teamName(teamId) }}</h1>
            <div class="flex gap-2">
              @if (club.canManageTeam(teamId)) {
                <button type="button" class="btn-small" (click)="startAddingPlayer()">ADD PLAYER</button>
              }
              @if (canInvite()) {
                <button type="button" class="btn-small" (click)="startInviting()">INVITE MEMBER</button>
              }
            </div>
          </div>

          @if (requests().length) {
            <h2 class="label-caps text-[13px]">PENDING REQUESTS · {{ requests().length }}</h2>
            <div role="list" class="overflow-hidden rounded-lg border-2 border-dashed border-ink">
              @for (p of requests(); track p.id) {
                <aura-invited-row [vm]="p" (opened)="open('profile', p.id)" />
              }
            </div>
          }

          <h2 class="label-caps text-[13px]">TEAM STAFF</h2>
          <div class="card">
            <div role="list" class="card-grid">
              @for (s of staff(); track s.id) {
                <aura-staff-row [vm]="s" (opened)="open('user', s.id)" />
              } @empty {
                <div class="card-row text-sm">No staff assigned.</div>
              }
            </div>
          </div>

          <h2 class="label-caps mt-1 text-[13px]">PLAYERS · {{ players().length }}</h2>
          <div class="card">
            <div role="list" class="card-grid">
              @for (p of players(); track p.id) {
                <aura-player-row [vm]="p" (opened)="open('profile', p.id)" />
              }
            </div>
          </div>

          <h2 class="label-caps mt-1 text-[13px]">PARENTS · {{ parents().length }}</h2>
          <div class="card">
            <div role="list" class="card-grid">
              @for (p of parents(); track p.id) {
                <aura-staff-row [vm]="p" (opened)="open('user', p.id)" />
              } @empty {
                <div class="card-row text-sm">No parents yet.</div>
              }
            </div>
          </div>

          @if (club.seesInvites() && invited().length) {
            <h2 class="label-caps mt-1 text-[13px]">INVITED</h2>
            <div role="list" class="overflow-hidden rounded-lg border-2 border-dashed border-ink">
              @for (u of invited(); track u.id) {
                <aura-invited-row [vm]="u" (opened)="open('user', u.id)" />
              }
            </div>
          }

          <h2 class="label-caps mt-1 text-[13px]">CLUB STAFF</h2>
          <div class="card">
            <div role="list" class="card-grid">
              @for (s of clubStaff(); track s.id) {
                <aura-staff-row [vm]="s" (opened)="open('user', s.id)" />
              }
            </div>
          </div>
        </div>
      }
    </main>

    @if (inviting() && selected(); as teamId) {
      <aura-invite-form
        [teamOptions]="inviteTeamOptions()"
        [initialTeam]="teamId"
        [linkedThreadCounts]="linkedThreadCounts()"
        [canInviteClubStaff]="club.isClubStaff()"
        [clubStaffThreadCount]="clubWideThreadCount()"
        [existingByTeam]="existingByTeam()"
        [saving]="invite.saving()"
        [error]="invite.error()"
        (closed)="inviting.set(false)"
        (submitted)="sendInvite($event)"
        (addedExisting)="addExisting($event)"
      />
    }
    @if (addingPlayer() && selected(); as teamId) {
      <aura-add-player-form
        [teamName]="club.teamName(teamId)"
        [parentOptions]="parentOptions()"
        [saving]="playerWork.saving()"
        [error]="playerWork.error()"
        (closed)="addingPlayer.set(false)"
        (submitted)="addPlayer(teamId, $event)"
      />
    }
    @if (details(); as d) {
      <aura-person-details
        [vm]="d"
        [saving]="detailsWork.saving()"
        [error]="detailsWork.error()"
        (closed)="opened.set(null)"
        (saved)="saveDetails($event)"
        (resend)="resendInvite()"
        (cancelInvite)="cancelInvite()"
        (resetPassword)="resetPassword()"
        (disable)="setDisabled(true)"
        (enable)="setDisabled(false)"
        (remove)="removeMember()"
        (approve)="approvePlayer()"
        (removePlayer)="removePlayer()"
        (giveSignIn)="givePlayerSignIn($event)"
      />
    }
    @if (inviteReady(); as ready) {
      <aura-member-invited [vm]="ready" (copied)="copy($event)" (closed)="readyQueue.update((q) => q.slice(1))" />
    }
  `,
})
export class RosterPage {
  protected readonly club = inject(ClubStore);
  private readonly chat = inject(ChatStore);
  private readonly toaster = inject(Toaster);
  private readonly origin = inject(DOCUMENT).location.origin;

  /** Optional `?team=` query parameter, e.g. when arriving from a team card. */
  readonly team = input<TeamId | undefined>();

  protected readonly inviting = signal(false);
  protected readonly addingPlayer = signal(false);
  protected readonly playerWork = new Submission();
  protected readonly invite = new Submission();
  /** Whose details are open: a member, or a player profile. */
  protected readonly opened = signal<{ kind: 'user' | 'profile'; id: string } | null>(null);
  protected readonly detailsWork = new Submission();
  protected readonly details = computed<PersonDetailsVm | null>(() => {
    const target = this.opened();
    if (target?.kind === 'user') {
      const user = this.club.user(target.id);
      return user ? this.userDetails(user) : null;
    }
    const profile = target && this.club.profiles().find((p) => p.id === target.id);
    return profile ? this.profileDetails(profile) : null;
  });
  /** Sign-ins just created (a parent and their player, say), shown one after another to send by hand. */
  protected readonly readyQueue = signal<MemberInvitedVm[]>([]);
  protected readonly inviteReady = computed(() => this.readyQueue()[0] ?? null);
  protected readonly selectedTeam = linkedSignal<TeamId>(() => this.team() ?? '');
  protected readonly selected = computed(() => {
    const mine = this.club.myTeams();
    return mine.includes(this.selectedTeam()) ? this.selectedTeam() : (mine[0] ?? null);
  });

  protected readonly tabs = computed<Choice<TeamId>[]>(() =>
    this.club.myTeams().map((id) => ({ value: id, label: this.club.teamName(id).toUpperCase() })),
  );
  protected readonly inviteTeamOptions = computed<Choice<TeamId>[]>(() =>
    this.club.myTeams().map((id) => ({ value: id, label: this.club.teamName(id) })),
  );
  protected readonly canInvite = computed(
    () => this.club.isClubStaff() || (this.club.isTeamStaff() && this.club.myTeams().includes(this.selected() ?? '')),
  );
  /** Club-wide channels, which club staff join automatically. */
  protected readonly clubWideThreadCount = computed(() => this.chat.threads().filter(isClubWide).length);
  protected readonly linkedThreadCounts = computed(() => {
    const counts: Record<TeamId, Record<InviteKind, number>> = {};
    for (const team of this.club.myTeams()) {
      counts[team] = { parent: 0, player: 0, staff: 0 };
      for (const kind of INVITE_KINDS) {
        const group = KIND_GROUP[kind];
        counts[team][kind] = group ? this.chat.linkedThreadCount(team, group) : 0;
      }
    }
    return counts;
  });

  protected readonly staff = computed<PersonRowVm[]>(() => {
    const id = this.selected();
    const me = this.club.meId();
    return this.club
      .users()
      .filter((u) => u.kind === 'staff' && !u.invited && !!id && u.teams.includes(id) && this.shown(u))
      .map((u) => {
        const others = u.teams.filter((t) => t !== id);
        return {
          id: u.id,
          name: u.name + (u.id === me ? ' (you)' : ''),
          sub: 'Team Staff' + (others.length ? ` · also ${others.join(', ')}` : '') + disabledNote(u),
        };
      });
  });

  /** The club's staff, who belong to no team. Invited ones only for club staff, who manage them. */
  protected readonly clubStaff = computed<PersonRowVm[]>(() => {
    const me = this.club.meId();
    return this.club
      .users()
      .filter((u) => u.kind === 'club' && this.shown(u) && (!u.invited || this.club.isClubStaff()))
      .map((u) => ({
        id: u.id,
        name: u.name + (u.id === me ? ' (you)' : ''),
        sub:
          [u.title || 'Club Staff', u.clubAdmin ? 'Club admin' : ''].filter(Boolean).join(' · ') +
          (u.invited ? ` · invited as ${u.email}` : '') +
          disabledNote(u),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Parents' link requests, for the staff who approve them. */
  protected readonly requests = computed<PersonRowVm[]>(() => {
    const id = this.selected();
    if (!id || !this.club.canManageTeam(id)) return [];
    return this.club
      .profiles()
      .filter((p) => p.team === id && p.pending)
      .map((p) => ({
        id: p.id,
        name: p.name + (p.jersey !== '–' ? ` · #${p.jersey}` : ''),
        sub: `Requested by ${this.names(p.parentIds) || 'a former member'}`,
      }));
  });

  protected readonly players = computed<PlayerRowVm[]>(() => {
    const id = this.selected();
    const me = this.club.meId();
    const persona = this.club.persona();
    const mine = new Set(this.club.myPlayers().map((p) => p.id));
    // Staff see requests in their own section; parents see their own, marked pending.
    const showPending = (p: PlayerProfile) => !!me && p.parentIds.includes(me) && !this.club.canManageTeam(p.team);
    return this.club
      .profiles()
      .filter((p) => p.team === id && (!p.pending || showPending(p)))
      .map((p) => {
        const isMine = mine.has(p.id);
        const parents = this.names(p.parentIds);
        const sub = isMine
          ? (p.userId === me && persona === 'player' ? 'You' : 'Your player') + (p.pending ? ' · pending approval' : '')
          : [p.userId ? 'Own sign-in' : '', parents ? `Parents: ${parents}` : ''].filter(Boolean).join(' · ');
        return { id: p.id, name: p.name, jersey: p.jersey, mine: isMine, sub };
      })
      .sort((a, b) => (Number(a.jersey) || 99) - (Number(b.jersey) || 99));
  });

  /**
   * Parents on this team: parent members of the team, and anyone (a coach, say) who is the parent
   * of one of its players. Invited parents too, marked; pending requests don't count until approved.
   */
  protected readonly parents = computed<PersonRowVm[]>(() => {
    const id = this.selected();
    const me = this.club.meId();
    const players = this.club.profiles().filter((p) => p.team === id && !p.pending);
    const linked = new Set(players.flatMap((p) => p.parentIds));
    return this.club
      .users()
      .filter((u) => this.shown(u) && ((u.kind === 'parent' && !!id && u.teams.includes(id)) || linked.has(u.id)))
      .map((u) => {
        const children = players.filter((p) => p.parentIds.includes(u.id)).map((p) => p.name);
        const role = u.kind === 'parent' ? '' : `${KIND_LABEL[u.kind]} · `;
        return {
          id: u.id,
          name: u.name + (u.id === me ? ' (you)' : ''),
          sub:
            role +
            (children.length ? `Parent of ${children.join(', ')}` : 'No player linked yet') +
            (u.invited ? ' · invited' : '') +
            disabledNote(u),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** team → people already in the club the viewer may add to it (instead of inviting them again). */
  protected readonly existingByTeam = computed<Record<TeamId, ParentOptionVm[]>>(() => {
    const out: Record<TeamId, ParentOptionVm[]> = {};
    for (const team of this.club.myTeams()) {
      out[team] = this.club
        .users()
        .filter((u) => !u.disabled && !u.teams.includes(team) && this.club.canChangeMemberTeam(u, team))
        .map((u) => ({
          id: u.id,
          name: u.name,
          sub:
            KIND_LABEL[u.kind] +
            (u.teams.length ? ` · ${this.teamNames(u.teams)}` : '') +
            (u.invited ? ' · invited' : ''),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  });

  /** Who can be ticked as a player's parent: the team's parents and staff (a coach can be a parent). */
  protected readonly parentOptions = computed<ParentOptionVm[]>(() => {
    const id = this.selected();
    return this.club
      .users()
      .filter((u) => (u.kind === 'parent' || u.kind === 'staff') && !u.disabled && !!id && u.teams.includes(id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        sub: KIND_LABEL[u.kind] + (u.invited ? ' · invited' : ''),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Disabled members are listed for club staff, who can enable them again, and hidden from others. */
  private shown(u: User): boolean {
    return !u.disabled || this.club.isClubStaff();
  }

  private names(ids: string[]): string {
    return ids
      .map((id) => this.club.user(id)?.name)
      .filter(Boolean)
      .join(', ');
  }

  /** Invites to this team. Invited parents are listed under PARENTS instead. */
  protected readonly invited = computed<PersonRowVm[]>(() => {
    const id = this.selected();
    return this.club
      .users()
      .filter((u) => u.invited && u.kind !== 'parent' && !!id && u.teams.includes(id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        sub: KIND_LABEL[u.kind] + (u.email ? ` · invited as ${u.email}` : ' · invited'),
      }));
  });

  protected startInviting(): void {
    this.invite.reset();
    this.inviting.set(true);
  }

  protected async sendInvite(value: InviteFormValue): Promise<void> {
    const count =
      value.kind === 'club' ? this.clubWideThreadCount() : (this.linkedThreadCounts()[value.team]?.[value.kind] ?? 0);
    let ready: MemberInvitedVm | null = null;
    const ok = await this.invite.run(async () => {
      ready = this.readyVm(await this.club.inviteMember(value));
    }, errorMessage('Could not invite them. Try again.'));
    if (!ok) return;
    this.toaster.show(`${value.name} invited. Added to ${count} chat threads automatically.`);
    this.inviting.set(false);
    this.showReady(ready);
  }

  protected async addExisting({ team, userId }: ExistingMemberValue): Promise<void> {
    const user = this.club.user(userId);
    if (!user) return;
    const ok = await this.invite.run(
      () => this.club.setMemberTeams(userId, [...user.teams, team]),
      errorMessage('Could not add them to the team. Try again.'),
    );
    if (!ok) return;
    this.toaster.show(`${user.name} added to ${this.club.teamName(team)}.`);
    this.inviting.set(false);
  }

  private showReady(ready: MemberInvitedVm | null): void {
    if (ready) this.readyQueue.update((q) => [...q, ready]);
  }

  private teamNames(ids: TeamId[]): string {
    return ids.map((t) => this.club.teamName(t)).join(', ');
  }

  private userDetails(user: User): PersonDetailsVm {
    const children = this.club.profiles().filter((p) => p.parentIds.includes(user.id));
    const fields: DetailFieldVm[] = [
      { key: 'name', label: 'NAME', value: user.name, editable: true, required: true, editOnly: true },
      {
        key: 'email',
        label: 'EMAIL',
        value: user.email ?? '',
        editable: true,
        required: true,
        type: 'email',
        hint: 'This is also their username for signing in to the club.',
      },
      ...(user.kind === 'club'
        ? [{ key: 'title', label: 'TITLE', value: user.title ?? '', editable: true }]
        : [this.teamsField(user)]),
      ...(children.length
        ? [{ key: 'players', label: 'PLAYERS', value: children.map((p) => p.name).join(', '), editable: false }]
        : []),
    ];
    const canEditDetails = this.club.canEditMember(user);
    const teams = fields.find((f) => f.key === 'teams');
    for (const f of fields) if (f !== teams) f.editable &&= canEditDetails;
    return {
      name: user.name,
      role:
        KIND_LABEL[user.kind] +
        (user.clubAdmin ? ' · Club admin' : '') +
        (user.invited ? ' · invited, not signed in yet' : '') +
        (user.disabled ? ' · disabled' : ''),
      invited: !!user.invited,
      fields,
      canEdit: canEditDetails || !!teams?.editable,
      canManageInvite: this.club.canManageInvite(user),
      disabled: !!user.disabled,
      canResetPassword: this.club.canResetPassword(user),
      canRemove: this.club.canRemoveMember(user),
    };
  }

  /** The teams the viewer may put this member on or take them off; the others are kept as they are. */
  private teamOptions(user: User): TeamId[] {
    return this.club
      .teams()
      .map((t) => t.id)
      .filter((t) => this.club.canChangeMemberTeam(user, t));
  }

  private teamsField(user: User): DetailFieldVm {
    const options = this.teamOptions(user);
    return {
      key: 'teams',
      label: 'TEAMS',
      value: this.teamNames(user.teams),
      editable: options.length > 0,
      options: options.map((id) => ({ id, label: this.club.teamName(id), sub: '' })),
      selected: user.teams.filter((t) => options.includes(t)),
    };
  }

  private profileDetails(p: PlayerProfile): PersonDetailsVm {
    const player = this.club.user(p.userId);
    const manages = this.club.canManageTeam(p.team);
    // Teams the player can move to: those the viewer also manages.
    const moveTo = manages ? this.club.myTeams().filter((t) => this.club.canManageTeam(t)) : [];
    // Current parents stay listed even if they are not on the team.
    const options = [
      ...this.parentOptions(),
      ...p.parentIds
        .filter((id) => !this.parentOptions().some((o) => o.id === id))
        .map((id) => ({ id, name: this.club.user(id)?.name ?? 'Unknown', sub: 'Not on this team' })),
    ];
    return {
      name: p.name,
      role: `Player · #${p.jersey} · ${this.club.teamName(p.team)}` + (p.pending ? ' · pending approval' : ''),
      jersey: p.jersey,
      invited: false,
      fields: [
        { key: 'name', label: 'NAME', value: p.name, editable: true, required: true, editOnly: true },
        { key: 'jersey', label: 'JERSEY', value: p.jersey, editable: true, required: true, editOnly: true },
        {
          key: 'team',
          label: 'TEAM',
          value: this.club.teamName(p.team),
          editable: moveTo.length > 1,
          editOnly: true,
          choices: moveTo.map((id) => ({ value: id, label: this.club.teamName(id) })),
          selected: [p.team],
        },
        {
          key: 'parents',
          label: 'PARENTS',
          value: this.names(p.parentIds),
          editable: this.club.canManageTeam(p.team),
          options: options.map((o) => ({ id: o.id, label: o.name, sub: o.sub })),
          selected: p.parentIds,
        },
        {
          key: 'signIn',
          label: 'OWN SIGN-IN',
          value: player ? (player.email ?? 'Yes') + (player.invited ? ' (invited)' : '') : '',
          editable: false,
        },
      ],
      canEdit: this.club.canEditProfile(p),
      canManageInvite: false,
      pending: !!p.pending,
      canManagePlayer: manages,
      canGiveSignIn: manages && !p.userId && !p.pending,
    };
  }

  protected open(kind: 'user' | 'profile', id: string): void {
    this.detailsWork.reset();
    this.opened.set({ kind, id });
  }

  protected async saveDetails(values: PersonDetailsValue): Promise<void> {
    const target = this.opened();
    if (!target) return;
    const text = (key: string) => {
      const v = values[key];
      return typeof v === 'string' ? v : undefined;
    };
    let moved: TeamId | null = null;
    const ok = await this.detailsWork.run(async () => {
      if (target.kind === 'user') {
        const user = this.club.user(target.id);
        const title = text('title');
        if (text('name') !== undefined) {
          await this.club.updateMember({
            id: target.id,
            name: text('name') ?? '',
            email: text('email') ?? '',
            ...(title !== undefined ? { title } : {}),
          });
        }
        const picked = values['teams'];
        if (user && Array.isArray(picked)) {
          const options = this.teamOptions(user);
          const teams = [...user.teams.filter((t) => !options.includes(t)), ...picked];
          if ([...teams].sort().join() !== user.teams.join()) await this.club.setMemberTeams(user.id, teams);
        }
        return;
      }
      const profile = this.club.profiles().find((p) => p.id === target.id);
      const parents = values['parents'];
      if (profile && Array.isArray(parents) && parents.join() !== profile.parentIds.join()) {
        await this.club.setPlayerParents(target.id, parents);
      }
      await this.club.updateProfile({ id: target.id, name: text('name') ?? '', jersey: text('jersey') ?? '' });
      const team = text('team');
      if (profile && team && team !== profile.team) {
        await this.club.movePlayer(target.id, team);
        moved = team;
      }
    }, errorMessage('Could not save their details. Try again.'));
    if (!ok) return;
    if (moved) {
      // Follow the player to their new team.
      this.selectedTeam.set(moved);
      this.toaster.show(`${text('name')} moved to ${this.club.teamName(moved)}.`);
    } else {
      this.toaster.show(`${text('name') ?? this.club.user(target.id)?.name} saved.`);
    }
  }

  protected startAddingPlayer(): void {
    this.playerWork.reset();
    this.addingPlayer.set(true);
  }

  /** Invites a new parent first, when the form names one, then adds the player with them. */
  protected async addPlayer(team: TeamId, { newParent, ...value }: AddPlayerValue): Promise<void> {
    const invites: MemberInvite[] = [];
    const ok = await this.playerWork.run(async () => {
      const parentIds = [...value.parentIds];
      if (newParent) {
        const parent = await this.club.inviteMember({ kind: 'parent', team, ...newParent });
        invites.push(parent);
        parentIds.push(parent.user.id);
      }
      const player = await this.club.addPlayer({ team, ...value, parentIds });
      if (player) invites.push(player);
    }, errorMessage('Could not add the player. Try again.'));
    // A parent invited before adding the player failed stays invited: hand over their sign-in anyway.
    for (const invite of invites) this.showReady(this.readyVm(invite));
    if (!ok) return;
    this.addingPlayer.set(false);
    this.toaster.show(
      `${value.name} added to ${this.club.teamName(team)}.` + (newParent ? ` ${newParent.name} invited.` : ''),
    );
  }

  /** The open profile, if any. */
  private openProfile(): PlayerProfile | undefined {
    const target = this.opened();
    return target?.kind === 'profile' ? this.club.profiles().find((p) => p.id === target.id) : undefined;
  }

  protected async approvePlayer(): Promise<void> {
    const p = this.openProfile();
    if (!p) return;
    const ok = await this.detailsWork.run(
      () => this.club.approvePlayer(p.id),
      errorMessage('Could not approve the player. Try again.'),
    );
    if (ok) this.toaster.show(`${p.name} approved and added to ${this.club.teamName(p.team)}.`);
  }

  protected async removePlayer(): Promise<void> {
    const p = this.openProfile();
    if (!p) return;
    const ok = await this.detailsWork.run(
      () => this.club.removePlayer(p.id),
      errorMessage(p.pending ? 'Could not reject the request. Try again.' : 'Could not remove the player. Try again.'),
    );
    if (!ok) return;
    this.opened.set(null);
    this.toaster.show(p.pending ? `Request for ${p.name} rejected.` : `${p.name} removed from the roster.`);
  }

  protected async givePlayerSignIn(email: string): Promise<void> {
    const p = this.openProfile();
    if (!p) return;
    let invite: MemberInvite | null = null;
    const ok = await this.detailsWork.run(async () => {
      invite = await this.club.givePlayerSignIn(p.id, email);
    }, errorMessage('Could not create their sign-in. Try again.'));
    if (!ok || !invite) return;
    this.opened.set(null);
    this.showReady(this.readyVm(invite));
    this.toaster.show(`${p.name} can now sign in themselves.`);
  }

  protected async resendInvite(): Promise<void> {
    const id = this.opened()?.id;
    if (!id) return;
    let invite: MemberInvite | null = null;
    const ok = await this.detailsWork.run(async () => {
      invite = await this.club.resendInvite(id);
    }, errorMessage('Could not resend the invite. Try again.'));
    if (!ok || !invite) return;
    this.opened.set(null);
    this.showReady(this.readyVm(invite));
    this.toaster.show('New temporary password created. The previous one no longer works.');
  }

  protected async cancelInvite(): Promise<void> {
    const user = this.club.user(this.opened()?.id);
    if (!user) return;
    const ok = await this.detailsWork.run(
      () => this.club.cancelInvite(user.id),
      errorMessage('Could not cancel the invite. Try again.'),
    );
    if (!ok) return;
    this.opened.set(null);
    this.toaster.show(`${user.name}’s invite cancelled.`);
  }

  protected async resetPassword(): Promise<void> {
    const id = this.opened()?.id;
    if (!id) return;
    let reset: MemberInvite | null = null;
    const ok = await this.detailsWork.run(async () => {
      reset = await this.club.resetPassword(id);
    }, errorMessage('Could not reset their password. Try again.'));
    if (!ok || !reset) return;
    this.opened.set(null);
    this.showReady({ ...this.readyVm(reset), reset: true });
    this.toaster.show('New temporary password created. The previous password no longer works.');
  }

  protected async setDisabled(disabled: boolean): Promise<void> {
    const user = this.club.user(this.opened()?.id);
    if (!user) return;
    const ok = await this.detailsWork.run(
      () => this.club.setMemberDisabled(user.id, disabled),
      errorMessage(`Could not ${disabled ? 'disable' : 'enable'} them. Try again.`),
    );
    if (ok) this.toaster.show(`${user.name} ${disabled ? 'disabled' : 'enabled'}.`);
  }

  protected async removeMember(): Promise<void> {
    const user = this.club.user(this.opened()?.id);
    if (!user) return;
    const ok = await this.detailsWork.run(
      () => this.club.removeMember(user.id),
      errorMessage('Could not remove them. Try again.'),
    );
    if (!ok) return;
    this.opened.set(null);
    this.toaster.show(`${user.name} removed from the club.`);
  }

  private readyVm(invite: MemberInvite): MemberInvitedVm {
    return {
      name: invite.user.name,
      clubName: this.club.club()?.name ?? '',
      url: `${this.origin}/${this.club.slug()}`,
      username: invite.username,
      temporaryPassword: invite.temporaryPassword,
    };
  }

  protected copy({ label, value }: CopiedValue): void {
    navigator.clipboard?.writeText(value).catch(() => undefined);
    this.toaster.show(`${label} copied.`);
  }
}
