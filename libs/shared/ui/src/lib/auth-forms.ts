import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

export interface SignInValue {
  username: string;
  password: string;
}

/**
 * Full-page sign-in: optional logo, title and subtitle above username and password.
 * Project extra content (e.g. a demo hint) below the button.
 */
@Component({
  selector: 'aura-sign-in-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full items-center justify-center overflow-y-auto px-6 py-10' },
  template: `
    <form class="flex w-full max-w-[400px] flex-col gap-3" (submit)="submit($event)">
      @if (logoUrl()) {
        <img [src]="logoUrl()" alt="" class="mb-1 size-20 self-center object-contain" />
      }
      <h1 class="text-center font-display text-[32px] leading-[1.05] font-bold uppercase">{{ title() }}</h1>
      @if (subtitle()) {
        <p class="-mt-1 mb-2 text-center text-[15px] font-medium text-pretty">{{ subtitle() }}</p>
      }
      <label class="field">
        {{ usernameLabel() }}
        <input
          class="field-input"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          [value]="username()"
          (input)="username.set(value($event))"
        />
      </label>
      <label class="field">
        PASSWORD
        <input
          class="field-input"
          type="password"
          name="password"
          autocomplete="current-password"
          [value]="password()"
          (input)="password.set(value($event))"
        />
      </label>
      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="submit" class="btn-primary mt-1" [disabled]="saving()">
        {{ saving() ? 'SIGNING IN…' : 'SIGN IN' }}
      </button>
      <ng-content />
    </form>
  `,
})
export class SignInForm {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly logoUrl = input<string | null | undefined>(null);
  readonly usernameLabel = input('EMAIL');
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<SignInValue>();

  protected readonly username = signal('');
  protected readonly password = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(e: Event): void {
    e.preventDefault();
    const username = this.username().trim();
    if (!username || !this.password()) {
      this.validationError.set('Enter your email and password.');
      return;
    }
    this.validationError.set('');
    this.submitted.emit({ username, password: this.password() });
  }
}

/** Choose a new password (twice). Used after signing in with a temporary password. */
@Component({
  selector: 'aura-new-password-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full items-center justify-center overflow-y-auto px-6 py-10' },
  template: `
    <form class="flex w-full max-w-[400px] flex-col gap-3" (submit)="submit($event)">
      <h1 class="text-center font-display text-[32px] leading-[1.05] font-bold uppercase">{{ title() }}</h1>
      <p class="-mt-1 mb-2 text-center text-[15px] font-medium text-pretty">
        You signed in with a temporary password. Choose your own to continue.
      </p>
      <label class="field">
        NEW PASSWORD
        <input
          class="field-input"
          type="password"
          name="new-password"
          autocomplete="new-password"
          [value]="password()"
          (input)="password.set(value($event))"
        />
        <span class="field-hint">At least {{ minLength }} characters.</span>
      </label>
      <label class="field">
        CONFIRM PASSWORD
        <input
          class="field-input"
          type="password"
          name="confirm-password"
          autocomplete="new-password"
          [value]="confirm()"
          (input)="confirm.set(value($event))"
        />
      </label>
      @if (shownError()) {
        <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
      }
      <button type="submit" class="btn-primary mt-1" [disabled]="saving()">SAVE PASSWORD</button>
      <ng-content />
    </form>
  `,
})
export class NewPasswordForm {
  readonly title = input('Choose a password');
  readonly saving = input(false);
  readonly error = input('');

  readonly submitted = output<string>();

  protected readonly minLength = 8;
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected submit(e: Event): void {
    e.preventDefault();
    const pw = this.password();
    const problem =
      pw.length < this.minLength
        ? `Use at least ${this.minLength} characters.`
        : pw !== this.confirm()
          ? 'The passwords don’t match.'
          : '';
    this.validationError.set(problem);
    if (!problem) this.submitted.emit(pw);
  }
}
