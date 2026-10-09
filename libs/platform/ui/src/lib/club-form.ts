import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { Club, ClubAccount } from '@aura/shared/models';
import { Icon } from '@aura/shared/ui';
import {
  DEFAULT_THEME,
  contrastLevel,
  contrastRatio,
  normalizeHex,
  randomSlug,
  readFileAsDataUrl,
  readLogoColors,
  renderAppIcon,
  temporaryPassword,
} from '@aura/shared/util';

export interface ClubFormValue {
  name: string;
  slug: string;
  logoUrl: string;
  icons?: Club['icons'];
  ink: string;
  paper: string;
  logoInk: string;
  logoPaper: string;
  adminName: string;
  adminEmail: string;
  /** Empty when editing. */
  temporaryPassword: string;
}

const CONTRAST_NOTE = {
  pass: 'Passes for all text.',
  large: 'Large text only. Smaller text will be hard to read.',
  fail: 'Too low. Text will be hard to read.',
} as const;

/**
 * Create or edit a club: name, logo (colours are read from it), the two app colours with
 * a contrast check and live preview, the club admin's sign-in, and the club's link.
 */
@Component({
  selector: 'aura-club-form',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto flex max-w-[1100px] flex-col gap-3.5 px-3.5 pt-3.5 pb-6 wide:p-6">
      <button type="button" class="flex items-center gap-0.5 self-start text-sm font-semibold" (click)="back.emit()">
        <aura-icon name="back" [size]="18" />All clubs
      </button>
      <h1 class="font-display text-[30px] leading-none font-bold uppercase">{{ club()?.name ?? 'New club' }}</h1>

      <div class="grid items-start gap-7 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        <div class="flex min-w-0 flex-col gap-3">
          <label class="field">
            CLUB NAME
            <input
              class="field-input h-12"
              [value]="name()"
              (input)="name.set(value($event))"
              placeholder="e.g. Northside Aura"
            />
          </label>

          <div class="mt-1.5 label-caps">CLUB LOGO</div>
          <label
            class="flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ink p-4 text-center"
            (dragover)="$event.preventDefault()"
            (drop)="drop($event)"
          >
            <input type="file" accept="image/*" class="sr-only" (change)="pick($event)" />
            @if (logoUrl()) {
              <img [src]="logoUrl()" alt="Club logo" class="max-h-24 max-w-[80%] object-contain" />
              <span class="text-[13px] font-semibold underline">Replace logo</span>
            } @else {
              <aura-icon name="upload" [size]="30" />
              <span class="text-[15px] font-semibold">Drop the logo here or click to upload</span>
              <span class="text-[13px]">PNG, SVG or JPG. A transparent background works best.</span>
            }
          </label>

          <div class="mt-1.5 flex items-baseline justify-between gap-2">
            <div class="label-caps">APP COLOURS</div>
            <div class="flex gap-3.5">
              <button type="button" class="btn-link text-[13px]" (click)="swap()">Swap</button>
              @if (logoInk()) {
                <button type="button" class="btn-link text-[13px]" (click)="resetToLogo()">
                  Reset to logo colours
                </button>
              }
            </div>
          </div>
          <p class="field-hint -mt-1 text-pretty">
            Pulled from the logo when you upload it. Primary replaces black in the app; secondary replaces white.
          </p>
          @for (c of colorRows; track c.key) {
            <div class="flex items-center gap-2.5 rounded-lg border-2 border-ink px-2.5 py-2">
              <input
                type="color"
                class="size-11 shrink-0 cursor-pointer rounded-md border-2 border-ink bg-transparent p-0"
                [attr.aria-label]="c.label + ' colour'"
                [value]="c.key === 'ink' ? ink() : paper()"
                (input)="setColor(c.key, value($event))"
              />
              <div class="min-w-0 flex-1">
                <div class="text-[15px] font-semibold">{{ c.label }}</div>
                <div class="text-xs">{{ c.hint }}</div>
              </div>
              <input
                class="h-10 w-[100px] rounded-md border-2 border-ink bg-transparent px-2 font-mono text-[15px] font-medium outline-none"
                maxlength="7"
                [attr.aria-label]="c.label + ' hex'"
                [value]="c.key === 'ink' ? inkText() : paperText()"
                (input)="typeColor(c.key, value($event))"
              />
            </div>
          }
          <div
            class="flex items-center gap-3 rounded-lg border-2 border-ink px-3 py-2.5"
            [class.border-dashed]="contrast().level !== 'pass'"
          >
            <div class="shrink-0 font-display text-[22px] font-bold">{{ contrast().text }}</div>
            <div class="text-[13px] leading-snug font-medium text-pretty">Contrast. {{ contrast().note }}</div>
          </div>

          <div class="mt-1.5 label-caps">CLUB ADMIN</div>
          <label class="flex flex-col gap-[5px] text-[13px] font-semibold">
            Name
            <input
              class="field-input"
              [value]="adminName()"
              (input)="adminName.set(value($event))"
              placeholder="First and last name"
            />
          </label>
          <label class="flex flex-col gap-[5px] text-[13px] font-semibold">
            Sign-in email
            <input
              class="field-input"
              type="email"
              [value]="adminEmail()"
              (input)="adminEmail.set(value($event))"
              placeholder="admin@club.com"
            />
          </label>
          @if (!club()) {
            <label class="flex flex-col gap-[5px] text-[13px] font-semibold">
              Temporary password
              <span class="flex gap-2">
                <input class="field-input font-mono" [value]="password()" (input)="password.set(value($event))" />
                <button
                  type="button"
                  class="h-[46px] shrink-0 rounded-md border-2 border-ink bg-paper px-3.5 font-display text-sm font-bold tracking-[0.05em]"
                  (click)="password.set(newPassword())"
                >
                  REGENERATE
                </button>
              </span>
            </label>
            <p class="field-hint -mt-1">The admin is asked to set their own password on first sign-in.</p>
          }

          <div class="mt-1.5 flex items-baseline justify-between">
            <div class="label-caps">CLUB LINK</div>
            @if (!club()) {
              <button type="button" class="btn-link text-[13px]" (click)="slug.set(newSlug())">New link</button>
            }
          </div>
          <div class="flex h-[46px] items-center overflow-hidden rounded-md border-2 border-ink">
            <span class="min-w-0 flex-1 truncate px-3 font-mono text-[15px] font-medium">{{ url() }}</span>
            <button
              type="button"
              class="h-full bg-ink px-3.5 font-display text-sm font-bold tracking-[0.05em] text-paper"
              (click)="copied.emit(url())"
            >
              COPY
            </button>
          </div>
          <p class="field-hint -mt-1">Unique to this club. Members open it to install the app.</p>

          @if (shownError()) {
            <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
          }
          <button type="button" class="btn-primary mt-1" [disabled]="saving() || working()" (click)="submit()">
            {{ club() ? 'SAVE CHANGES' : 'CREATE CLUB' }}
          </button>
        </div>

        <div class="sticky top-0 flex min-w-0 flex-col items-center gap-2.5">
          <div class="label-caps self-stretch">LIVE PREVIEW</div>
          <div
            class="w-full max-w-[340px] overflow-hidden rounded-[18px] border-2 border-ink"
            [style.background]="paper()"
            [style.color]="ink()"
            aria-hidden="true"
          >
            <div class="flex h-[52px] items-center justify-center border-b-2" [style.border-color]="ink()">
              @if (logoUrl()) {
                <img [src]="logoUrl()" alt="" class="h-9 max-w-[120px] object-contain" />
              } @else {
                <div class="size-[34px] rounded-full border-2 border-dashed" [style.border-color]="ink()"></div>
              }
            </div>
            <div class="flex flex-col gap-2.5 p-3">
              <div class="grid grid-cols-2 overflow-hidden rounded-lg border-2" [style.border-color]="ink()">
                <div
                  class="flex h-9 items-center justify-center font-display text-[15px] font-bold tracking-[0.03em]"
                  [style.background]="ink()"
                  [style.color]="paper()"
                >
                  UPCOMING
                </div>
                <div
                  class="flex h-9 items-center justify-center border-l-2 font-display text-[15px] font-bold tracking-[0.03em]"
                  [style.border-color]="ink()"
                >
                  PAST
                </div>
              </div>
              <div class="flex flex-col gap-[3px] rounded-lg border-2 p-3" [style.border-color]="ink()">
                <div class="flex justify-between gap-2">
                  <div class="font-display text-[19px] leading-[1.1] font-bold">GAME VS. RIVERSIDE HAWKS</div>
                  <div
                    class="shrink-0 self-start rounded border-[1.5px] px-[5px] py-[3px] font-display text-[11px] leading-none font-bold"
                    [style.border-color]="ink()"
                  >
                    U18B
                  </div>
                </div>
                <div class="text-[13px] font-semibold">Thu, Oct 8 · 7:30 PM · Home</div>
                <div class="text-[13px]">Main gym · Court 1</div>
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <div
                    class="flex h-10 items-center justify-center rounded-md border-2 font-display text-base font-bold"
                    [style.border-color]="ink()"
                    [style.background]="ink()"
                    [style.color]="paper()"
                  >
                    ✓ GOING
                  </div>
                  <div
                    class="flex h-10 items-center justify-center rounded-md border-2 font-display text-base font-bold"
                    [style.border-color]="ink()"
                  >
                    ✕ OUT
                  </div>
                </div>
              </div>
              <div class="rounded-lg border-2 p-3" [style.border-color]="ink()">
                <div class="font-display text-[19px] leading-[1.1] font-bold">PRACTICE</div>
                <div class="mt-[3px] text-[13px] font-semibold">Sat, Oct 10 · 9:00 AM</div>
              </div>
            </div>
            <div class="grid grid-cols-4 border-t-2" [style.border-color]="ink()">
              @for (tab of previewTabs; track tab; let first = $first) {
                <div
                  class="flex h-11 items-center justify-center text-xs font-semibold"
                  [style.background]="first ? ink() : null"
                  [style.color]="first ? paper() : null"
                >
                  {{ tab }}
                </div>
              }
            </div>
          </div>
          @if (club()) {
            <button
              type="button"
              class="btn-outline h-[46px] w-full max-w-[340px] text-base"
              (click)="previewed.emit()"
            >
              OPEN APP PREVIEW
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ClubForm {
  /** The club being edited; null to create one. */
  readonly club = input<ClubAccount | null>(null);
  /** Prefix of club links, e.g. `https://aura.pages.dev/`. */
  readonly baseUrl = input.required<string>();
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<ClubFormValue>();
  readonly copied = output<string>();
  readonly previewed = output<void>();
  readonly back = output<void>();
  /** Something worth a toast, e.g. the colours read from a new logo. */
  readonly notice = output<string>();

  protected readonly previewTabs = ['Schedule', 'Chat', 'Roster', 'More'];
  protected readonly colorRows = [
    { key: 'ink', label: 'Primary', hint: 'Text, borders, buttons' },
    { key: 'paper', label: 'Secondary', hint: 'Backgrounds, text on buttons' },
  ] as const;
  protected readonly newPassword = temporaryPassword;
  protected readonly newSlug = randomSlug;

  protected readonly name = linkedSignal(() => this.club()?.name ?? '');
  protected readonly logoUrl = linkedSignal(() => this.club()?.logoUrl ?? '');
  protected readonly logoInk = linkedSignal(() => this.club()?.logoInk ?? '');
  protected readonly logoPaper = linkedSignal(() => this.club()?.logoPaper ?? '');
  protected readonly ink = linkedSignal(() => this.club()?.ink ?? DEFAULT_THEME.ink);
  protected readonly paper = linkedSignal(() => this.club()?.paper ?? DEFAULT_THEME.paper);
  /** What is typed in the hex boxes, which may be mid-edit and not yet valid. */
  protected readonly inkText = linkedSignal(() => this.ink());
  protected readonly paperText = linkedSignal(() => this.paper());
  protected readonly adminName = linkedSignal(() => this.club()?.adminName ?? '');
  protected readonly adminEmail = linkedSignal(() => this.club()?.adminEmail ?? '');
  protected readonly password = signal(temporaryPassword());
  protected readonly slug = linkedSignal(() => this.club()?.slug ?? randomSlug());
  /** Reading a logo or drawing icons. */
  protected readonly working = signal(false);

  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());
  protected readonly url = computed(() => this.baseUrl() + this.slug());
  protected readonly contrast = computed(() => {
    const ratio = contrastRatio(this.ink(), this.paper());
    const level = contrastLevel(ratio);
    return { text: `${ratio.toFixed(1)}:1`, level, note: CONTRAST_NOTE[level] };
  });

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setColor(key: 'ink' | 'paper', hex: string): void {
    (key === 'ink' ? this.ink : this.paper).set(hex);
    (key === 'ink' ? this.inkText : this.paperText).set(hex);
  }

  protected typeColor(key: 'ink' | 'paper', text: string): void {
    (key === 'ink' ? this.inkText : this.paperText).set(text);
    const hex = normalizeHex(text);
    if (hex) (key === 'ink' ? this.ink : this.paper).set(hex);
  }

  protected swap(): void {
    const [ink, paper] = [this.paper(), this.ink()];
    this.setColor('ink', ink);
    this.setColor('paper', paper);
  }

  protected resetToLogo(): void {
    this.setColor('ink', this.logoInk());
    this.setColor('paper', this.logoPaper());
  }

  protected pick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    void this.loadLogo(file);
  }

  protected drop(e: DragEvent): void {
    e.preventDefault();
    void this.loadLogo(e.dataTransfer?.files[0]);
  }

  private async loadLogo(file: File | undefined): Promise<void> {
    if (!file?.type.startsWith('image/')) {
      this.notice.emit('Choose an image file.');
      return;
    }
    this.working.set(true);
    try {
      const url = await readFileAsDataUrl(file);
      const colors = await readLogoColors(url);
      const { ink, paper } = colors ?? DEFAULT_THEME;
      this.logoUrl.set(url);
      this.logoInk.set(ink);
      this.logoPaper.set(paper);
      this.setColor('ink', ink);
      this.setColor('paper', paper);
      this.validationError.set('');
      this.notice.emit(
        colors
          ? `Colours pulled from the logo: ${ink} and ${paper}.`
          : 'Couldn’t read the logo colours. Using black and white.',
      );
    } finally {
      this.working.set(false);
    }
  }

  private validate(): string {
    if (!this.name().trim()) return 'Enter the club name.';
    if (!this.logoUrl()) return 'Upload the club logo.';
    if (!this.adminName().trim()) return 'Enter the club admin’s name.';
    if (!this.adminEmail().includes('@')) return 'Enter a valid sign-in email for the admin.';
    if (!this.club() && this.password().length < 8) return 'Temporary password must be at least 8 characters.';
    return '';
  }

  /** App icons are redrawn when the logo or background changes. */
  private async icons(): Promise<Club['icons']> {
    const club = this.club();
    if (club && club.logoUrl === this.logoUrl() && club.paper === this.paper()) return club.icons;
    const [size192, size512] = await Promise.all(
      [192, 512].map((size) => renderAppIcon(this.logoUrl(), this.paper(), size)),
    );
    return size192 && size512 ? { size192, size512 } : undefined;
  }

  protected async submit(): Promise<void> {
    const problem = this.validate();
    this.validationError.set(problem);
    if (problem) return;
    this.working.set(true);
    try {
      const icons = await this.icons();
      this.submitted.emit({
        name: this.name().trim(),
        slug: this.slug(),
        logoUrl: this.logoUrl(),
        ...(icons ? { icons } : {}),
        ink: this.ink(),
        paper: this.paper(),
        logoInk: this.logoInk() || this.ink(),
        logoPaper: this.logoPaper() || this.paper(),
        adminName: this.adminName().trim(),
        adminEmail: this.adminEmail().trim(),
        temporaryPassword: this.club() ? '' : this.password(),
      });
    } finally {
      this.working.set(false);
    }
  }
}
