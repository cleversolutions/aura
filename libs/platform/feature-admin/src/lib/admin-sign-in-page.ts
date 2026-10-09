import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ClubStore } from '@aura/club/data-access';
import { PlatformStore } from '@aura/platform/data-access';
import { SignInForm, SignInValue } from '@aura/shared/ui';
import { Submission, errorMessage } from '@aura/shared/util';

/** Platform admin sign-in. Not tied to any club. */
@Component({
  selector: 'aura-admin-sign-in-page',
  imports: [SignInForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <aura-sign-in-form
      title="Aura"
      subtitle="Platform admin"
      [saving]="save.saving()"
      [error]="save.error()"
      (submitted)="signIn($event)"
    >
      @if (demo) {
        <p class="mt-2 text-center text-[13px] leading-snug">
          Mock backend: <strong>admin&#64;aura.example</strong> with the password <strong>password</strong>.
        </p>
      }
    </aura-sign-in-form>
  `,
})
export class AdminSignInPage {
  private readonly platform = inject(PlatformStore);
  private readonly router = inject(Router);
  private readonly club = inject(ClubStore);
  protected readonly save = new Submission();
  protected readonly demo = this.club.demoClubs().length > 0;

  constructor() {
    this.club.close();
  }

  protected async signIn({ username, password }: SignInValue): Promise<void> {
    const ok = await this.save.run(
      () => this.platform.signIn(username, password),
      errorMessage('Could not sign in. Try again.'),
    );
    if (ok) void this.router.navigate(['/admin']);
  }
}
