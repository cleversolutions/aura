import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import {
  AddPlayerForm,
  AddPlayerValue,
  CopiedValue,
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
import { KIND_GROUP, Submission, Toaster, ageOf, errorMessage } from '@aura/shared/util';

/** A new member's sign-in, as the store returns it. */
type MemberInvite = Awaited<ReturnType<ClubStore['resendInvite']>>;

const KIND_LABEL = { staff: 'Team Staff', parent: 'Parent', player: 'Player', club: 'Club Staff' } as const;
const INVITE_KINDS: InviteKind[] = ['parent', 'player', 'staff'];

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

          @if (invited().length) {
            <h2 class="label-caps mt-1 text-[13px]">INVITED</h2>
            <div role="list" class="overflow-hidden rounded-lg border-2 border-dashed border-ink">
              @for (u of invited(); track u.id) {
                <aura-invited-row [vm]="u" (opened)="open('user', u.id)" />
              }
            </div>
          }
        </div>
      }
    </main>

    @if (inviting() && selected(); as teamId) {
      <aura-invite-form
        [teamOptions]="inviteTeamOptions()"
        [initialTeam]="teamId"
        [linkedThreadCounts]="linkedThreadCounts()"
        [saving]="invite.saving()"
        [error]="invite.error()"
        (closed)="inviting.set(false)"
        (submitted)="sendInvite($event)"
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
      />
    }
    @if (inviteReady(); as ready) {
      <aura-member-invited [vm]="ready" (copied)="copy($event)" (closed)="inviteReady.set(null)" />
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
  /** Sign-in details for the member just invited, to send them by hand. */
  protected readonly inviteReady = signal<MemberInvitedVm | null>(null);
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
      .filter((u) => u.kind === 'staff' && !u.invited && !!id && u.teams.includes(id))
      .map((u) => {
        const others = u.teams.filter((t) => t !== id);
        return {
          id: u.id,
          name: u.name + (u.id === me ? ' (you)' : ''),
          sub: 'Team Staff' + (others.length ? ` · also ${others.join(', ')}` : ''),
        };
      });
  });

  protected readonly players = computed<PlayerRowVm[]>(() => {
    const id = this.selected();
    const me = this.club.meId();
    const persona = this.club.persona();
    const mine = new Set(this.club.myPlayers().map((p) => p.id));
    return this.club
      .profiles()
      .filter((p) => p.team === id && (!p.pending || (!!me && p.parentIds.includes(me))))
      .map((p) => {
        const isMine = mine.has(p.id);
        const parents = this.names(p.parentIds);
        const sub = isMine
          ? (p.userId === me && persona === 'player' ? 'You' : 'Your player') + (p.pending ? ' · pending approval' : '')
          : [p.userId ? 'Own login' : '', parents ? `Parents: ${parents}` : ''].filter(Boolean).join(' · ');
        return { id: p.id, name: p.name, jersey: p.jersey, mine: isMine, sub };
      })
      .sort((a, b) => (Number(a.jersey) || 99) - (Number(b.jersey) || 99));
  });

  /**
   * Parents on this team: parent members of the team, and anyone (a coach, say) who is the parent
   * of one of its players.
   */
  protected readonly parents = computed<PersonRowVm[]>(() => {
    const id = this.selected();
    const me = this.club.meId();
    const players = this.club.profiles().filter((p) => p.team === id);
    const linked = new Set(players.flatMap((p) => p.parentIds));
    return this.club
      .users()
      .filter((u) => !u.invited && ((u.kind === 'parent' && !!id && u.teams.includes(id)) || linked.has(u.id)))
      .map((u) => {
        const children = players.filter((p) => p.parentIds.includes(u.id)).map((p) => p.name);
        const role = u.kind === 'parent' ? '' : `${KIND_LABEL[u.kind]} · `;
        return {
          id: u.id,
          name: u.name + (u.id === me ? ' (you)' : ''),
          sub: role + (children.length ? `Parent of ${children.join(', ')}` : 'No player linked yet'),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Who can be ticked as a player's parent: the team's parents and staff (a coach can be a parent). */
  protected readonly parentOptions = computed<ParentOptionVm[]>(() => {
    const id = this.selected();
    return this.club
      .users()
      .filter((u) => (u.kind === 'parent' || u.kind === 'staff') && !!id && u.teams.includes(id))
      .map((u) => ({
        id: u.id,
        name: u.name,
        sub: KIND_LABEL[u.kind] + (u.invited ? ' · invited' : ''),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  private names(ids: string[]): string {
    return ids
      .map((id) => this.club.user(id)?.name)
      .filter(Boolean)
      .join(', ');
  }

  protected readonly invited = computed<PersonRowVm[]>(() => {
    const id = this.selected();
    return this.club
      .users()
      .filter((u) => u.invited && !!id && u.teams.includes(id))
      .map((u) => ({ id: u.id, name: u.name, sub: `${KIND_LABEL[u.kind]} · invited as ${u.email}` }));
  });

  protected startInviting(): void {
    this.invite.reset();
    this.inviting.set(true);
  }

  protected async sendInvite(value: InviteFormValue): Promise<void> {
    const count = this.linkedThreadCounts()[value.team]?.[value.kind] ?? 0;
    let ready: MemberInvitedVm | null = null;
    const ok = await this.invite.run(async () => {
      ready = this.readyVm(await this.club.inviteMember(value));
    }, errorMessage('Could not invite them. Try again.'));
    if (!ok) return;
    this.toaster.show(
      `${value.name} invited. Added to ${count} ${this.club.teamName(value.team)} threads automatically.`,
    );
    this.inviting.set(false);
    this.inviteReady.set(ready);
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
        : [{ key: 'teams', label: 'TEAMS', value: this.teamNames(user.teams), editable: false }]),
      ...(children.length
        ? [{ key: 'players', label: 'PLAYERS', value: children.map((p) => p.name).join(', '), editable: false }]
        : []),
    ];
    return {
      name: user.name,
      role: KIND_LABEL[user.kind] + (user.invited ? ' · invited, not signed in yet' : ''),
      invited: !!user.invited,
      fields,
      canEdit: this.club.canEditMember(user),
      canManageInvite: this.club.canManageInvite(user),
    };
  }

  private profileDetails(p: PlayerProfile): PersonDetailsVm {
    const player = this.club.user(p.userId);
    // Current parents stay listed even if they are not on the team.
    const options = [
      ...this.parentOptions(),
      ...p.parentIds
        .filter((id) => !this.parentOptions().some((o) => o.id === id))
        .map((id) => ({ id, name: this.club.user(id)?.name ?? 'Unknown', sub: 'Not on this team' })),
    ];
    // A separate login is for older players (16+), as on the More tab.
    const loginEditable = ageOf(p.team) >= 16 || !!p.login;
    return {
      name: p.name,
      role: `Player · #${p.jersey} · ${this.club.teamName(p.team)}` + (p.pending ? ' · pending approval' : ''),
      jersey: p.jersey,
      invited: false,
      fields: [
        { key: 'name', label: 'NAME', value: p.name, editable: true, required: true, editOnly: true },
        { key: 'jersey', label: 'JERSEY', value: p.jersey, editable: true, required: true, editOnly: true },
        {
          key: 'parents',
          label: 'PARENTS',
          value: this.names(p.parentIds),
          editable: this.club.canManageTeam(p.team),
          options: options.map((o) => ({ id: o.id, label: o.name, sub: o.sub })),
          selected: p.parentIds,
        },
        {
          key: 'login',
          label: 'OWN LOGIN',
          value: player?.email ?? p.login,
          editable: loginEditable,
          type: 'email',
        },
      ],
      canEdit: this.club.canEditProfile(p),
      canManageInvite: false,
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
    const ok = await this.detailsWork.run(async () => {
      if (target.kind === 'user') {
        const title = text('title');
        await this.club.updateMember({
          id: target.id,
          name: text('name') ?? '',
          email: text('email') ?? '',
          ...(title !== undefined ? { title } : {}),
        });
        return;
      }
      const profile = this.club.profiles().find((p) => p.id === target.id);
      const parents = values['parents'];
      if (profile && Array.isArray(parents) && parents.join() !== profile.parentIds.join()) {
        await this.club.setPlayerParents(target.id, parents);
      }
      await this.club.updateProfile({
        id: target.id,
        name: text('name') ?? '',
        jersey: text('jersey') ?? '',
        login: text('login') ?? profile?.login ?? '',
      });
    }, errorMessage('Could not save their details. Try again.'));
    if (ok) this.toaster.show(`${text('name')} saved.`);
  }

  protected startAddingPlayer(): void {
    this.playerWork.reset();
    this.addingPlayer.set(true);
  }

  protected async addPlayer(team: TeamId, value: AddPlayerValue): Promise<void> {
    let invite: MemberInvite | null = null;
    const ok = await this.playerWork.run(async () => {
      invite = await this.club.addPlayer({ team, ...value });
    }, errorMessage('Could not add the player. Try again.'));
    if (!ok) return;
    this.addingPlayer.set(false);
    this.toaster.show(`${value.name} added to ${this.club.teamName(team)}.`);
    if (invite) this.inviteReady.set(this.readyVm(invite));
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
    this.inviteReady.set(this.readyVm(invite));
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
