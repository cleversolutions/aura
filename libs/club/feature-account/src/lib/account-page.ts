import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import {
  ClubSettingsForm,
  CopiedValue,
  LinkPlayerForm,
  LinkPlayerValue,
  MemberForm,
  MemberFormValue,
  MemberInvited,
  MemberInvitedVm,
  PlayerAccessTile,
  PlayerAccessVm,
  PlayerProfileForm,
  PlayerProfileValue,
  ProfileHeader,
  ProfileVm,
  SeasonTeamVm,
  StaffOptionVm,
  StartSeasonForm,
  StartSeasonValue,
  TeamCard,
  TeamCardVm,
  TeamForm,
  TeamFormValue,
} from '@aura/club/ui';
import { ClubSettings, PlayerProfile, TeamId } from '@aura/shared/models';
import { AppHeader, Chips, Choice } from '@aura/shared/ui';
import { KIND_GROUP, Submission, Toaster, errorMessage, formatSeasonSpan, teamBadge } from '@aura/shared/util';

/** More tab container: profile, player access, teams, club settings and the demo account switcher. */
@Component({
  selector: 'aura-account-page',
  imports: [
    RouterLink,
    AppHeader,
    Chips,
    ProfileHeader,
    PlayerAccessTile,
    TeamCard,
    PlayerProfileForm,
    LinkPlayerForm,
    TeamForm,
    MemberInvited,
    MemberForm,
    ClubSettingsForm,
    StartSeasonForm,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <aura-app-header [clubName]="club.club()?.name ?? ''" [logoUrl]="club.club()?.logoUrl" title="More" />

    <main class="min-h-0 flex-1 overflow-y-auto">
      @if (profile(); as me) {
        <div class="max-w-[1100px]">
          <aura-profile-header [vm]="me" [editable]="!club.archived()" (edited)="startEditingMe()" />

          @if (club.persona() === 'parent' || club.persona() === 'player' || club.myPlayers().length) {
            <section class="flex flex-col gap-2.5 px-3.5 py-[18px] wide:px-6">
              <h2 class="heading-section">PLAYER ACCESS</h2>
              <div class="tile-grid">
                @for (p of playerTiles(); track p.id) {
                  <aura-player-access-tile [vm]="p" (opened)="startEditingPlayer(p.id)" />
                }
              </div>
              @if (club.persona() === 'parent' && !club.archived()) {
                <button
                  type="button"
                  class="btn-outline mt-2 h-[52px] text-lg active:bg-ink active:text-paper wide:max-w-[300px]"
                  (click)="startLinking()"
                >
                  LINK NEW PLAYER
                </button>
              }
            </section>
          }

          @if (club.isClubStaff() || club.isTeamStaff()) {
            <section class="flex flex-col gap-2.5 px-3.5 py-[18px] wide:px-6">
              <div class="flex items-center justify-between">
                <h2 class="heading-section">{{ club.isClubStaff() ? 'CLUB TEAMS' : 'MY TEAMS' }}</h2>
                @if (club.isClubStaff() && !club.archived()) {
                  <button type="button" class="btn-small" (click)="startTeam('new')">+ CREATE TEAM</button>
                }
              </div>
              <div class="tile-grid">
                @for (t of teamCards(); track t.id) {
                  <aura-team-card [vm]="t" (opened)="openTeam(t.id)" />
                }
              </div>
            </section>
          }

          @if (club.isClubStaff() || club.pastSeasons().length) {
            <section class="flex flex-col gap-2.5 px-3.5 py-[18px] wide:px-6">
              <div class="flex items-center justify-between">
                <h2 class="heading-section">SEASON</h2>
                @if (club.isClubStaff() && !club.archived()) {
                  <button type="button" class="btn-small" (click)="startSeasonForm()">START NEW SEASON</button>
                }
              </div>
              @if (club.season(); as season) {
                <div class="rounded-md border-2 border-ink px-3.5 py-3 wide:max-w-[420px]">
                  <span class="block text-base font-semibold">{{ season.name }} · current</span>
                  <span class="block text-[13px]">{{ seasonSpan(season) }} · {{ club.teams().length }} teams</span>
                </div>
              }
              @for (past of club.pastSeasons(); track past.id) {
                <a
                  class="flex items-center justify-between gap-3 rounded-md border-2 border-dashed border-ink px-3.5 py-3 active:bg-pressed wide:max-w-[420px]"
                  [routerLink]="['/', club.slug(), 'roster']"
                  [queryParams]="{ season: past.id }"
                >
                  <span>
                    <span class="block text-base font-semibold">{{ past.name }}</span>
                    <span class="block text-[13px]">{{ seasonSpan(past) }} · read-only</span>
                  </span>
                  <span class="font-display text-sm font-bold tracking-[0.05em]">VIEW</span>
                </a>
              }
            </section>
          }

          @if (club.isClubStaff() && !club.archived()) {
            <section class="flex flex-col gap-2.5 px-3.5 py-[18px] wide:px-6">
              <h2 class="heading-section">CLUB SETTINGS</h2>
              <button
                type="button"
                class="flex items-center justify-between gap-3 rounded-md border-2 border-ink px-3.5 py-3 text-left active:bg-pressed wide:max-w-[420px]"
                (click)="startSettings()"
              >
                <span>
                  <span class="block text-base font-semibold">Announcements</span>
                  <span class="block text-[13px]">{{ announcementsSummary() }}</span>
                  <span class="mt-1.5 block text-base font-semibold">Contact details</span>
                  <span class="block text-[13px]">{{ contactsSummary() }}</span>
                </span>
                <span class="font-display text-sm font-bold tracking-[0.05em]">EDIT</span>
              </button>
            </section>
          }

          @if (club.demoAccounts().length) {
            <section class="flex flex-col gap-2.5 border-t-2 border-dashed border-ink px-3.5 py-[18px] wide:px-6">
              <h2 class="heading-section">DEMO ACCOUNT</h2>
              <p class="text-[13px] leading-snug">Mock backend: switch who is signed in to see each role.</p>
              <aura-chips
                [options]="demoOptions()"
                [value]="club.meId() ?? ''"
                (valueChange)="club.switchUser($event)"
              />
            </section>
          }

          @if (!club.preview()) {
            <section class="border-t-2 border-ink px-3.5 py-[18px] wide:px-6">
              <button type="button" class="btn-outline h-12 w-full text-lg wide:max-w-[300px]" (click)="signOut()">
                SIGN OUT
              </button>
            </section>
          }
        </div>
      }
    </main>

    @if (editingPlayer(); as p) {
      <aura-player-profile-form
        [player]="p"
        [teamName]="club.teamName(p.team)"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="editingPlayerId.set(null)"
        (submitted)="savePlayer(p, $event)"
      />
    }
    @if (linking()) {
      <aura-link-player-form
        [teamOptions]="allTeamOptions()"
        [initialTeam]="linkInitialTeam()"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="linking.set(false)"
        (submitted)="linkPlayer($event)"
      />
    }
    @if (teamTarget(); as target) {
      <aura-team-form
        [team]="target === 'new' ? null : (club.team(target) ?? null)"
        [canDelete]="target !== 'new'"
        [staffOptions]="staffOptions()"
        [initialStaff]="teamStaff()"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="teamTarget.set(null)"
        (submitted)="saveTeam(target, $event)"
        (deleted)="deleteTeam(target)"
      />
    }
    @if (startingSeason() && club.season(); as season) {
      <aura-start-season-form
        [currentName]="season.name"
        [teams]="seasonTeams()"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="startingSeason.set(false)"
        (submitted)="startSeason($event)"
      />
    }
    @if (editingMe() && club.me(); as me) {
      <aura-member-form
        [member]="{ name: me.name, email: me.email ?? '', phone: me.phone, title: me.title }"
        [showTitle]="me.kind === 'club'"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="editingMe.set(false)"
        (submitted)="saveMe($event)"
      />
    }
    @if (editingSettings()) {
      <aura-club-settings-form
        [settings]="club.settings()"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="editingSettings.set(false)"
        (submitted)="saveSettings($event)"
      />
    }
    @if (inviteReady(); as ready) {
      <aura-member-invited [vm]="ready" (copied)="copy($event)" (closed)="inviteReady.set(null)" />
    }
  `,
})
export class AccountPage {
  protected readonly club = inject(ClubStore);
  private readonly chat = inject(ChatStore);
  private readonly toaster = inject(Toaster);
  private readonly router = inject(Router);
  private readonly origin = inject(DOCUMENT).location.origin;

  /** Optional `?create=team` query parameter: opens the team form (from the roster's setup checklist). */
  readonly create = input<string | undefined>();

  protected readonly editingPlayerId = signal<string | null>(null);
  protected readonly linking = signal(false);
  protected readonly teamTarget = signal<TeamId | 'new' | null>(null);
  protected readonly editingMe = signal(false);
  protected readonly editingSettings = signal(false);
  protected readonly startingSeason = signal(false);
  /** Sign-in details for staff just invited with a team, to send them by hand. */
  protected readonly inviteReady = signal<MemberInvitedVm | null>(null);
  /** One sheet is open at a time, so they share a submission state. */
  protected readonly save = new Submission();

  protected readonly editingPlayer = computed(
    () => this.club.profiles().find((p) => p.id === this.editingPlayerId()) ?? null,
  );

  protected readonly profile = computed<ProfileVm | null>(() => {
    const me = this.club.me();
    if (!me) return null;
    return { name: me.name, info: this.club.roleLine(), email: me.email ?? '' };
  });

  protected readonly announcementsSummary = computed(() =>
    this.club.settings().announcements === 'staff' ? 'Staff post, everyone reads' : 'Everyone posts',
  );

  protected readonly contactsSummary = computed(() =>
    this.club.settings().contacts === 'staff'
      ? 'Staff see emails; families see their coaches’'
      : 'Everyone sees emails',
  );

  protected readonly playerTiles = computed<PlayerAccessVm[]>(() =>
    this.club.myPlayers().map((p) => ({
      id: p.id,
      name: p.name,
      jersey: p.jersey,
      teamName: this.club.teamName(p.team),
      access: p.pending ? 'Pending team staff approval' : p.userId ? this.ownSignIn(p.userId) : this.managedBy(p),
    })),
  );

  /** `Has own sign-in · eli@…`, when the viewer may see the email. */
  private ownSignIn(userId: string): string {
    const email = this.club.user(userId)?.email;
    return email ? `Has own sign-in · ${email}` : 'Has own sign-in';
  }

  /** `Managed by you`, or `Managed by you and Jenn Buell` when there are other parents. */
  private managedBy(p: PlayerProfile): string {
    const others = p.parentIds
      .filter((id) => id !== this.club.meId())
      .map((id) => this.club.user(id)?.name)
      .filter(Boolean);
    return `Managed by ${['you', ...others].join(' and ')}`;
  }

  protected readonly teamCards = computed<TeamCardVm[]>(() => {
    const users = this.club.users();
    const profiles = this.club.profiles();
    return this.club.myTeams().map((id) => {
      const players = profiles.filter((p) => p.team === id && !p.pending).length;
      const members = users.filter((u) => KIND_GROUP[u.kind] && u.teams.includes(id)).length;
      const staff = users.filter((u) => u.kind === 'staff' && u.teams.includes(id)).map((u) => u.name);
      const team = this.club.team(id);
      return {
        id,
        name: this.club.teamName(id),
        badge: team ? teamBadge(team) : id,
        counts: `${players} players · ${members} members`,
        staff: staff.length ? `Staff: ${staff.join(', ')}` : 'No staff assigned',
      };
    });
  });

  protected readonly staffOptions = computed<StaffOptionVm[]>(() =>
    this.club
      .users()
      .filter((u) => u.kind === 'staff')
      .map((u) => ({
        id: u.id,
        name: u.name,
        sub: u.teams.length ? `Currently: ${u.teams.map((t) => this.club.teamName(t)).join(', ')}` : 'No team yet',
      })),
  );

  protected readonly seasonTeams = computed<SeasonTeamVm[]>(() => {
    const users = this.club.users();
    const profiles = this.club.profiles();
    return this.club.teams().map((t) => {
      const players = profiles.filter((p) => p.team === t.id && !p.pending).length;
      const staff = users.filter((u) => u.kind === 'staff' && u.teams.includes(t.id)).length;
      return { ...t, counts: `${players} ${players === 1 ? 'player' : 'players'} · ${staff} staff` };
    });
  });

  protected readonly seasonSpan = formatSeasonSpan;

  constructor() {
    effect(() => {
      if (this.create() === 'team' && this.club.isClubStaff() && !this.club.archived())
        untracked(() => this.startTeam('new'));
    });
  }

  protected readonly allTeamOptions = computed<Choice<TeamId>[]>(() =>
    this.club.teams().map((t) => ({ value: t.id, label: t.name })),
  );

  /** Preselect one of my teams, else the first club team. */
  protected readonly linkInitialTeam = computed<TeamId>(
    () => this.club.myTeams().at(0) ?? this.club.teams().at(0)?.id ?? '',
  );

  protected readonly demoOptions = computed<Choice<string>[]>(() =>
    this.club.demoAccounts().map((a) => ({
      value: a.userId,
      label: `${this.club.user(a.userId)?.name.split(' ')[0] ?? a.userId} · ${a.label}`,
    })),
  );

  /**
   * Staff of the team being edited. A computed, so the form gets the same array on every change
   * detection; a new one would reset the form's selection on each click.
   */
  protected readonly teamStaff = computed<string[]>(() => {
    const target = this.teamTarget();
    if (!target || target === 'new') return [];
    return this.club
      .users()
      .filter((u) => u.kind === 'staff' && u.teams.includes(target))
      .map((u) => u.id);
  });

  /** Archived clubs are read-only, so nothing opens for editing. */
  protected startEditingPlayer(id: string): void {
    if (this.club.archived()) return;
    this.save.reset();
    this.editingPlayerId.set(id);
  }

  protected startEditingMe(): void {
    if (this.club.archived()) return;
    this.save.reset();
    this.editingMe.set(true);
  }

  protected async saveMe(value: MemberFormValue): Promise<void> {
    const me = this.club.meId();
    if (!me) return;
    const ok = await this.save.run(
      () => this.club.updateMember({ id: me, ...value }),
      errorMessage('Could not save your profile. Try again.'),
    );
    if (!ok) return;
    this.toaster.show('Profile saved.');
    this.editingMe.set(false);
  }

  protected startSettings(): void {
    this.save.reset();
    this.editingSettings.set(true);
  }

  protected async saveSettings(settings: ClubSettings): Promise<void> {
    const ok = await this.save.run(
      () => this.club.saveSettings(settings),
      errorMessage('Could not save the club settings. Try again.'),
    );
    if (!ok) return;
    this.toaster.show('Club settings saved.');
    this.editingSettings.set(false);
  }

  protected startSeasonForm(): void {
    this.save.reset();
    this.startingSeason.set(true);
  }

  protected async startSeason(value: StartSeasonValue): Promise<void> {
    const ok = await this.save.run(async () => {
      await this.club.startSeason(value);
      // New teams come with default channels; the old teams' channels are read-only now.
      await this.chat.load();
    }, errorMessage('Could not start the season.'));
    if (!ok) return;
    const n = value.teams.length;
    this.toaster.show(`${value.name} has started with ${n} ${n === 1 ? 'team' : 'teams'}.`);
    this.startingSeason.set(false);
  }

  protected async deleteTeam(target: TeamId | 'new'): Promise<void> {
    if (target === 'new') return;
    const name = this.club.teamName(target);
    const ok = await this.save.run(async () => {
      await this.club.deleteTeam(target);
      await this.chat.load();
    }, errorMessage('Could not delete the team.'));
    if (!ok) return;
    this.toaster.show(`${name} deleted.`);
    this.teamTarget.set(null);
  }

  protected startLinking(): void {
    this.save.reset();
    this.linking.set(true);
  }

  protected startTeam(target: TeamId | 'new'): void {
    this.save.reset();
    this.teamTarget.set(target);
  }

  /** Club staff manage a team's staff; team staff jump to its roster. */
  protected openTeam(id: TeamId): void {
    if (this.club.isClubStaff() && !this.club.archived()) this.startTeam(id);
    else void this.router.navigate(['/', this.club.slug(), 'roster'], { queryParams: { team: id } });
  }

  protected async savePlayer(player: PlayerProfile, value: PlayerProfileValue): Promise<void> {
    const ok = await this.save.run(
      () => this.club.updateProfile({ id: player.id, ...value }),
      'Could not save the player. Try again.',
    );
    if (!ok) return;
    this.toaster.show('Player profile saved.');
    this.editingPlayerId.set(null);
  }

  protected async linkPlayer(value: LinkPlayerValue): Promise<void> {
    const me = this.club.meId();
    if (!me) return;
    const ok = await this.save.run(
      () => this.club.requestPlayerLink({ ...value, parentId: me }),
      'Could not send the request. Try again.',
    );
    if (!ok) return;
    this.toaster.show(`Link request sent to ${this.club.teamName(value.team)} staff.`);
    this.linking.set(false);
  }

  protected async saveTeam(target: TeamId | 'new', value: TeamFormValue): Promise<void> {
    const editing = target === 'new' ? null : target;
    let ready: MemberInvitedVm | null = null;
    const ok = await this.save.run(async () => {
      const invite = await this.club.saveTeam({ id: editing ?? undefined, ...value });
      if (invite) {
        ready = {
          name: invite.user.name,
          clubName: this.club.club()?.name ?? '',
          url: `${this.origin}/${this.club.slug()}`,
          username: invite.username,
          temporaryPassword: invite.temporaryPassword,
        };
      }
      // New teams come with default channels.
      if (!editing) await this.chat.load();
    }, errorMessage('Could not save the team.'));
    if (!ok) return;
    const count = value.staffIds.length + (value.newStaff ? 1 : 0);
    const staff = count ? ` with ${count} staff` : '';
    this.toaster.show(
      editing
        ? `${value.name} saved.`
        : `${value.name} created${staff}. #announcements and #general are ready.` +
            (count ? '' : ' Club staff manage it until it has staff.'),
    );
    this.teamTarget.set(null);
    this.inviteReady.set(ready);
  }

  protected copy({ label, value }: CopiedValue): void {
    navigator.clipboard?.writeText(value).catch(() => undefined);
    this.toaster.show(`${label} copied.`);
  }

  protected async signOut(): Promise<void> {
    const slug = this.club.slug();
    await this.club.signOut();
    void this.router.navigate(['/', slug, 'sign-in']);
  }
}
