import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ClubStore } from '@aura/club/data-access';
import { NewPasswordForm, SignInForm, SignInValue } from '@aura/shared/ui';
import { Submission, Toaster, errorMessage } from '@aura/shared/util';

/** Sign in to the open club. Usernames are per club, so the club's link decides which account. */
@Component({
  selector: 'aura-sign-in-page',
  imports: [SignInForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <aura-sign-in-form
      [title]="club.club()?.name ?? ''"
      subtitle="Sign in to your club account."
      [logoUrl]="club.club()?.logoUrl"
      [saving]="save.saving()"
      [error]="save.error()"
      (submitted)="signIn($event)"
    >
      @if (demo) {
        <p class="mt-2 text-center text-[13px] leading-snug text-pretty">
          Mock backend: seeded accounts use the password <strong>password</strong>, for example
          <strong>jordan.smith@email.com</strong> (a different person in each club).
        </p>
      }
    </aura-sign-in-form>
  `,
})
export class SignInPage {
  protected readonly club = inject(ClubStore);
  private readonly router = inject(Router);
  protected readonly save = new Submission();
  protected readonly demo = this.club.demoClubs().length > 0;

  protected async signIn({ username, password }: SignInValue): Promise<void> {
    const ok = await this.save.run(
      () => this.club.signIn(username, password),
      errorMessage('Could not sign in. Try again.'),
    );
    if (!ok) return;
    const slug = this.club.slug() ?? '';
    void this.router.navigate(this.club.mustChangePassword() ? ['/', slug, 'set-password'] : ['/', slug]);
  }
}

/** Replace a temporary password before using the club app. */
@Component({
  selector: 'aura-set-password-page',
  imports: [NewPasswordForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <aura-new-password-form [saving]="save.saving()" [error]="save.error()" (submitted)="setPassword($event)">
      <button type="button" class="btn-link mt-1 self-center" (click)="signOut()">Sign out</button>
    </aura-new-password-form>
  `,
})
export class SetPasswordPage {
  private readonly club = inject(ClubStore);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);
  protected readonly save = new Submission();

  protected async setPassword(password: string): Promise<void> {
    const ok = await this.save.run(
      () => this.club.changePassword(password),
      errorMessage('Could not save your password. Try again.'),
    );
    if (!ok) return;
    this.toaster.show(`Password saved. Welcome to ${this.club.club()?.name ?? 'the club'}!`);
    void this.router.navigate(['/', this.club.slug() ?? '']);
  }

  protected async signOut(): Promise<void> {
    const slug = this.club.slug() ?? '';
    await this.club.signOut();
    void this.router.navigate(['/', slug, 'sign-in']);
  }
}
