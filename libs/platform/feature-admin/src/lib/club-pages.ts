import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClubStore } from '@aura/club/data-access';
import { PlatformStore } from '@aura/platform/data-access';
import { ClubCard, ClubCardVm, ClubCreated, ClubCreatedVm, ClubForm, ClubFormValue } from '@aura/platform/ui';
import { ClubAccount } from '@aura/shared/models';
import { Submission, Toaster, errorMessage } from '@aura/shared/util';

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
        @for (c of cards(); track c.id) {
          <aura-club-card [vm]="c" (opened)="router.navigate(['/admin/clubs', c.id])" (copied)="copy($event)" />
        }
      </div>
    </div>
  `,
})
export class ClubListPage extends ClubAdminPage {
  protected readonly count = computed(() => {
    const n = this.platform.clubs().length;
    return `${n} ${n === 1 ? 'club' : 'clubs'}`;
  });
  protected readonly cards = computed<ClubCardVm[]>(() =>
    this.platform.clubs().map((c) => ({
      id: c.id,
      name: c.name,
      url: this.baseUrl + c.slug,
      logoUrl: c.logoUrl,
      ink: c.ink,
      paper: c.paper,
      admin: `${c.adminName} · ${c.adminEmail}`,
      created: `Created ${dateFormat.format(new Date(c.createdAt))}`,
    })),
  );

  constructor() {
    super();
    this.platform.loadClubs().catch(() => this.toaster.show('Could not load clubs. Try again.'));
  }
}

/** `/admin/clubs/new` and `/admin/clubs/:clubId`. */
@Component({
  selector: 'aura-club-edit-page',
  imports: [ClubForm, ClubCreated],
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
