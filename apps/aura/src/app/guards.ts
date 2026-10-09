import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ClubStore } from '@aura/club/data-access';

const LAST_CLUB_KEY = 'aura.lastClub';

/** The club this browser last opened, so `/` can send people back to it. Best effort. */
function rememberClub(slug: string): void {
  try {
    localStorage.setItem(LAST_CLUB_KEY, slug);
  } catch {
    // Storage blocked: `/` shows the landing page instead.
  }
}

function lastClub(): string | null {
  try {
    return localStorage.getItem(LAST_CLUB_KEY);
  } catch {
    return null;
  }
}

/** `/:club`: opens the club for its link, or returns to `/` saying the link is unknown. */
export const clubGuard: CanActivateFn = async (route) => {
  // Inject before awaiting: the injection context ends at the first await.
  const store = inject(ClubStore);
  const router = inject(Router);
  const slug = route.paramMap.get('club') ?? '';
  const club = await store.open(slug).catch(() => null);
  if (!club) return router.createUrlTree(['/'], { queryParams: { missing: slug } });
  rememberClub(slug);
  return true;
};

/** The club app itself: needs a session with a password of the member's own choosing. */
export const signedInGuard: CanActivateFn = () => {
  const store = inject(ClubStore);
  const slug = store.slug() ?? '';
  if (store.mustChangePassword()) return inject(Router).createUrlTree(['/', slug, 'set-password']);
  if (!store.meId()) return inject(Router).createUrlTree(['/', slug, 'sign-in']);
  return true;
};

export const signedOutGuard: CanActivateFn = () => {
  const store = inject(ClubStore);
  if (!store.meId()) return true;
  const slug = store.slug() ?? '';
  return inject(Router).createUrlTree(store.mustChangePassword() ? ['/', slug, 'set-password'] : ['/', slug]);
};

export const mustChangePasswordGuard: CanActivateFn = () => {
  const store = inject(ClubStore);
  return store.mustChangePassword() || inject(Router).createUrlTree(['/', store.slug() ?? '']);
};

/** `/`: back to the last club opened here, else the landing page. */
export const landingGuard: CanActivateFn = (route) => {
  if (route.queryParamMap.has('missing')) return true;
  const slug = lastClub();
  return slug ? inject(Router).createUrlTree(['/', slug]) : true;
};
