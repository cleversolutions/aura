import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClubStore } from '@aura/club/data-access';
import { PlatformStore } from '@aura/platform/data-access';
import {
  ClubAdminPanel,
  ClubAdminPanelVm,
  ClubArchivePanel,
  ClubArchivePanelVm,
  ClubCard,
  ClubCardVm,
  ClubCreated,
  ClubCreatedVm,
  ClubForm,
  ClubFormValue,
} from '@aura/platform/ui';
import { ClubAccount, ClubStaffMember } from '@aura/shared/models';
import { Submission, Toaster, errorMessage } from '@aura/shared/util';

/** A club staff member's title and sign-in, and why they can't be the admin yet. */
function staffNote(m: ClubStaffMember): string {
  const state = m.invited ? 'invited, hasn’t joined yet' : m.disabled ? 'disabled' : '';
  return [m.title, m.email, state].filter(Boolean).join(' · ');
}

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** e.g. `12 members · 3 invited · 2 teams`; empty for a club just created, until the list reloads. */
function countsLine(club: ClubAccount): string {
  const c = club.counts;
  if (!c) return '';
  return [plural(c.members, 'member'), c.invited ? `${c.invited} invited` : '', plural(c.teams, 'team')]
    .filter(Boolean)
    .join(' · ');
}

/** Shared by the admin pages: link building, copying and previewing. */
abstract class ClubAdminPage {
  protected readonly platform = inject(PlatformStore);
  protected readonly router = inject(Router);
  protected readonly toaster = inject(Toaster);
  private readonly clubStore = inject(ClubStore);
  /** Club links are `<origin>/<slug>`; each one installs as its own app. */
  protected readonly baseUrl = `${inject(DOCUMENT).location.origin}/`;

  protected copy(url: string): void {
    navigator.clipboard?.writeText(url).catch(() => undefined);
    this.toaster.show(`Link copied: ${url}`);
  }

  /** Opens the club app with sample data under the club's branding. */
  protected async preview(club: ClubAccount): Promise<void> {
    try {
      await this.clubStore.openPreview(club.slug);
      void this.router.navigate(['/', club.slug]);
    } catch {
      this.toaster.show('Could not open the preview. Try again.');
    }
  }
}

/** `/admin`: every club, with its link to copy. */
@Component({
  selector: 'aura-club-list-page',
  imports: [ClubCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1100px] flex-col gap-3.5 px-3.5 pt-3.5 pb-6 wide:p-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h1 class="font-display text-[28px] leading-none font-bold">CLUBS</h1>
          <div class="mt-[3px] text-[13px] font-medium">{{ count() }}</div>
        </div>
        <button
          type="button"
          class="h-10 rounded-md bg-ink px-4 font-display text-[15px] font-bold tracking-[0.05em] text-paper"
          (click)="router.navigate(['/admin/clubs/new'])"
        >
          + NEW CLUB
        </button>
      </div>
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
        @for (c of cards().active; track c.id) {
          <aura-club-card [vm]="c" (opened)="router.navigate(['/admin/clubs', c.id])" (copied)="copy($event)" />
        }
      </div>
      @if (cards().archived.length) {
        <h2 class="label-caps mt-3">ARCHIVED · {{ cards().archived.length }}</h2>
        <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr))]">
          @for (c of cards().archived; track c.id) {
            <aura-club-card [vm]="c" (opened)="router.navigate(['/admin/clubs', c.id])" (copied)="copy($event)" />
          }
        </div>
      }
    </div>
  `,
})
export class ClubListPage extends ClubAdminPage {
  protected readonly count = computed(() => {
    const clubs = this.platform.clubs();
    const archived = clubs.filter((c) => c.archivedAt).length;
    return plural(clubs.length, 'club') + (archived ? ` · ${archived} archived` : '');
  });
  /** Clubs in use first; archived ones in their own section below. */
  protected readonly cards = computed(() => {
    const cards = this.platform.clubs().map((c): ClubCardVm => ({
      id: c.id,
      name: c.name,
      url: this.baseUrl + c.slug,
      logoUrl: c.logoUrl,
      ink: c.ink,
      paper: c.paper,
      admin: `${c.adminName} · ${c.adminEmail}`,
      counts: countsLine(c),
      created: c.archivedAt
        ? `Archived ${dateFormat.format(new Date(c.archivedAt))}`
        : `Created ${dateFormat.format(new Date(c.createdAt))}`,
      archived: !!c.archivedAt,
    }));
    return { active: cards.filter((c) => !c.archived), archived: cards.filter((c) => c.archived) };
  });

  constructor() {
    super();
    this.platform.loadClubs().catch(() => this.toaster.show('Could not load clubs. Try again.'));
  }
}

/** `/admin/clubs/new` and `/admin/clubs/:clubId`. */
@Component({
  selector: 'aura-club-edit-page',
  imports: [ClubForm, ClubCreated, ClubAdminPanel, ClubArchivePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (created(); as done) {
      <aura-club-created
        [vm]="done.vm"
        (copied)="copy($event)"
        (previewed)="preview(done.club)"
        (back)="router.navigate(['/admin'])"
      />
    } @else if (!clubId() || club()) {
      <aura-club-form
        [club]="club()"
        [baseUrl]="baseUrl"
        [saving]="save.saving()"
        [error]="save.error()"
        (submitted)="submit($event)"
        (copied)="copy($event)"
        (previewed)="previewCurrent()"
        (notice)="toaster.show($event)"
        (back)="router.navigate(['/admin'])"
      />
      @if (adminPanel(); as panel) {
        <div class="mx-auto max-w-[1100px] px-3.5 pb-6 wide:px-6">
          <aura-club-admin-panel
            [vm]="panel"
            [saving]="adminWork.saving()"
            [error]="adminWork.error()"
            (resetPassword)="resetAdminPassword()"
            (adminChanged)="setAdmin($event)"
            (copied)="copyPassword($event)"
          />
        </div>
      }
      @if (archivePanel(); as panel) {
        <div class="mx-auto max-w-[1100px] px-3.5 pb-6 wide:px-6">
          <aura-club-archive-panel
            [vm]="panel"
            [saving]="archiveWork.saving()"
            [error]="archiveWork.error()"
            (archivedChange)="setArchived($event)"
          />
        </div>
      }
    } @else if (platform.clubsLoaded()) {
      <p class="p-6 text-[15px] font-medium">Club not found.</p>
    }
  `,
})
export class ClubEditPage extends ClubAdminPage implements OnInit {
  /** Route parameter; absent for a new club. */
  readonly clubId = input<string>();

  protected readonly save = new Submission();
  protected readonly club = computed(() => {
    const id = this.clubId();
    return (id && this.platform.club(id)) || null;
  });
  protected readonly created = signal<{ club: ClubAccount; vm: ClubCreatedVm } | null>(null);
  protected readonly adminWork = new Submission();
  /** The admin's new temporary password, shown once. */
  private readonly adminReset = signal<{ clubId: string; username: string; temporaryPassword: string } | null>(null);
  protected readonly adminPanel = computed<ClubAdminPanelVm | null>(() => {
    const club = this.club();
    if (!club) return null;
    const reset = this.adminReset();
    return {
      adminName: club.adminName,
      adminEmail: club.adminEmail,
      staff: this.platform
        .clubStaff(club.id)
        .filter((m) => !m.admin)
        .map((m) => ({ id: m.id, name: m.name, sub: staffNote(m), eligible: !m.invited && !m.disabled })),
      reset: reset?.clubId === club.id ? reset : null,
    };
  });

  protected readonly archiveWork = new Submission();
  protected readonly archivePanel = computed<ClubArchivePanelVm | null>(() => {
    const club = this.club();
    if (!club) return null;
    return { name: club.name, archivedOn: club.archivedAt ? dateFormat.format(new Date(club.archivedAt)) : null };
  });

  constructor() {
    super();
    if (!this.platform.clubsLoaded()) {
      this.platform.loadClubs().catch(() => this.toaster.show('Could not load clubs. Try again.'));
    }
  }

  ngOnInit(): void {
    // Arriving from "create club": show the created panel once; a refresh shows the club's form.
    const id = this.clubId();
    const done = id ? this.platform.takeCreated(id) : null;
    if (done) this.showCreated(done.club, done.temporaryPassword);
    if (id) this.platform.loadClubStaff(id).catch(() => this.toaster.show('Could not load the club’s staff.'));
  }

  protected async resetAdminPassword(): Promise<void> {
    const club = this.club();
    if (!club) return;
    const ok = await this.adminWork.run(async () => {
      const { username, temporaryPassword } = await this.platform.resetAdminPassword(club.id);
      this.adminReset.set({ clubId: club.id, username, temporaryPassword });
    }, errorMessage('Could not reset the password. Try again.'));
    if (ok) this.toaster.show('New temporary password created. The previous password no longer works.');
  }

  protected async setAdmin(memberId: string): Promise<void> {
    const club = this.club();
    if (!club) return;
    const ok = await this.adminWork.run(
      () => this.platform.setClubAdmin(club.id, memberId),
      errorMessage('Could not change the club admin. Try again.'),
    );
    if (!ok) return;
    this.adminReset.set(null);
    this.toaster.show(`${this.club()?.adminName} is now the club admin.`);
  }

  protected async setArchived(archived: boolean): Promise<void> {
    const club = this.club();
    if (!club) return;
    const ok = await this.archiveWork.run(
      () => this.platform.setArchived(club.id, archived),
      errorMessage(archived ? 'Could not archive the club. Try again.' : 'Could not restore the club. Try again.'),
    );
    if (ok) this.toaster.show(archived ? `${club.name} archived. It is read-only.` : `${club.name} restored.`);
  }

  protected copyPassword(password: string): void {
    navigator.clipboard?.writeText(password).catch(() => undefined);
    this.toaster.show('Password copied.');
  }

  protected previewCurrent(): void {
    const club = this.club();
    if (club) void this.preview(club);
  }

  protected async submit({ temporaryPassword, slug, ...fields }: ClubFormValue): Promise<void> {
    const existing = this.club();
    if (existing) {
      const ok = await this.save.run(
        () => this.platform.updateClub(existing.id, fields),
        errorMessage('Could not save the club. Try again.'),
      );
      if (!ok) return;
      this.toaster.show(`${fields.name} saved.`);
      void this.router.navigate(['/admin']);
      return;
    }
    let club: ClubAccount | undefined;
    const ok = await this.save.run(async () => {
      club = await this.platform.createClub({ ...fields, slug, temporaryPassword });
    }, errorMessage('Could not create the club. Try again.'));
    if (!ok || !club) return;
    // The club's own page shows the created panel (PlatformStore.takeCreated), so a refresh
    // there shows the club rather than an empty new-club form.
    void this.router.navigate(['/admin/clubs', club.id], { replaceUrl: true });
  }

  private showCreated(club: ClubAccount, temporaryPassword: string): void {
    this.created.set({
      club,
      vm: {
        name: club.name,
        logoUrl: club.logoUrl,
        paper: club.paper,
        url: this.baseUrl + club.slug,
        adminName: club.adminName,
        adminEmail: club.adminEmail,
        temporaryPassword,
      },
    });
  }
}
