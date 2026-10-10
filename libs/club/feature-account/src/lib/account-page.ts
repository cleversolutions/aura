import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import {
  CopiedValue,
  LinkPlayerForm,
  LinkPlayerValue,
  MemberInvited,
  MemberInvitedVm,
  PlayerAccessTile,
  PlayerAccessVm,
  PlayerProfileForm,
  PlayerProfileValue,
  ProfileHeader,
  ProfileVm,
  StaffOptionVm,
  TeamCard,
  TeamCardVm,
  TeamForm,
  TeamFormValue,
} from '@aura/club/ui';
import { PlayerProfile, TeamId } from '@aura/shared/models';
import { AppHeader, Chips, Choice } from '@aura/shared/ui';
import { KIND_GROUP, Submission, Toaster, ageOf, errorMessage } from '@aura/shared/util';

/** More tab container: profile, player access, teams and the demo account switcher. */
@Component({
  selector: 'aura-account-page',
  imports: [
    AppHeader,
    Chips,
    ProfileHeader,
    PlayerAccessTile,
    TeamCard,
    PlayerProfileForm,
    LinkPlayerForm,
    TeamForm,
    MemberInvited,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <aura-app-header [clubName]="club.club()?.name ?? ''" [logoUrl]="club.club()?.logoUrl" title="More" />

    <main class="min-h-0 flex-1 overflow-y-auto">
      @if (profile(); as me) {
        <div class="max-w-[1100px]">
          <aura-profile-header [vm]="me" />

          @if (club.persona() === 'parent' || club.persona() === 'player') {
            <section class="flex flex-col gap-2.5 px-3.5 py-[18px] wide:px-6">
              <h2 class="heading-section">PLAYER ACCESS</h2>
              <div class="tile-grid">
                @for (p of playerTiles(); track p.id) {
                  <aura-player-access-tile [vm]="p" (opened)="startEditingPlayer(p.id)" />
                }
              </div>
              @if (club.persona() === 'parent') {
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
                @if (club.isClubStaff()) {
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
        [showLogin]="club.persona() === 'parent' && ageOf(p.team) >= 16"
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
        [existingName]="target === 'new' ? null : club.teamName(target)"
        [staffOptions]="staffOptions()"
        [initialStaff]="target === 'new' ? [] : staffOf(target)"
        [saving]="save.saving()"
        [error]="save.error()"
        (closed)="teamTarget.set(null)"
        (submitted)="saveTeam(target, $event)"
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

  protected readonly ageOf = ageOf;
  protected readonly editingPlayerId = signal<string | null>(null);
  protected readonly linking = signal(false);
  protected readonly teamTarget = signal<TeamId | 'new' | null>(null);
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

  protected readonly playerTiles = computed<PlayerAccessVm[]>(() =>
    this.club.myPlayers().map((p) => ({
      id: p.id,
      name: p.name,
      jersey: p.jersey,
      teamName: this.club.teamName(p.team),
      access: p.pending ? 'Pending team staff approval' : p.login ? `Has own login · ${p.login}` : 'Managed by you',
    })),
  );

  protected readonly teamCards = computed<TeamCardVm[]>(() => {
    const users = this.club.users();
    const profiles = this.club.profiles();
    return this.club.myTeams().map((id) => {
      const players = profiles.filter((p) => p.team === id && !p.pending).length;
      const members = users.filter((u) => KIND_GROUP[u.kind] && u.teams.includes(id)).length;
      const staff = users.filter((u) => u.kind === 'staff' && u.teams.includes(id)).map((u) => u.name);
      return {
        id,
        name: this.club.teamName(id),
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
        sub: u.teams.length ? `Currently: ${u.teams.join(', ')}` : 'No team yet',
      })),
  );

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

  protected staffOf(teamId: TeamId): string[] {
    return this.club
      .users()
      .filter((u) => u.kind === 'staff' && u.teams.includes(teamId))
      .map((u) => u.id);
  }

  protected startEditingPlayer(id: string): void {
    this.save.reset();
    this.editingPlayerId.set(id);
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
    if (this.club.isClubStaff()) this.startTeam(id);
    else void this.router.navigate(['/', this.club.slug(), 'roster'], { queryParams: { team: id } });
  }

  protected async savePlayer(player: PlayerProfile, value: PlayerProfileValue): Promise<void> {
    const ok = await this.save.run(
      () => this.club.updateProfile({ id: player.id, ...value }),
      'Could not save the player. Try again.',
    );
    if (!ok) return;
    this.toaster.show(
      value.login && value.login !== player.login
        ? `Saved. Login invite sent to ${value.login}`
        : 'Player profile saved.',
    );
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
    const teamName = editing ? this.club.teamName(editing) : (value.name ?? '');
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
    this.toaster.show(
      editing
        ? `${teamName} staff updated.`
        : `${teamName} created with ${count} staff. #announcements and #general are ready.`,
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
