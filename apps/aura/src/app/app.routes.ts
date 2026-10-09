import { Route } from '@angular/router';
import { clubGuard, landingGuard, mustChangePasswordGuard, signedInGuard, signedOutGuard } from './guards';
import { LandingPage } from './landing-page';
import { TabShell } from './tab-shell';

/*
 * Every club lives under its own link, `/<slug>`, and installs as its own app.
 * `/admin` is the platform admin. Club slugs never contain `i`, so they cannot clash with it.
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: LandingPage, canActivate: [landingGuard], title: 'Aura' },
  { path: 'admin', loadChildren: () => import('@aura/platform/feature-admin').then((m) => m.adminRoutes) },
  {
    path: ':club',
    canActivate: [clubGuard],
    children: [
      {
        path: 'sign-in',
        canActivate: [signedOutGuard],
        loadComponent: () => import('@aura/club/feature-account').then((m) => m.SignInPage),
        title: 'Sign in',
      },
      {
        path: 'set-password',
        canActivate: [mustChangePasswordGuard],
        loadComponent: () => import('@aura/club/feature-account').then((m) => m.SetPasswordPage),
        title: 'Choose a password',
      },
      {
        path: '',
        component: TabShell,
        canActivate: [signedInGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'schedule' },
          { path: 'schedule', loadChildren: () => import('@aura/schedule/feature').then((m) => m.scheduleRoutes) },
          { path: 'chat', loadChildren: () => import('@aura/chat/feature').then((m) => m.chatRoutes) },
          { path: 'roster', loadChildren: () => import('@aura/club/feature-roster').then((m) => m.rosterRoutes) },
          { path: 'more', loadChildren: () => import('@aura/club/feature-account').then((m) => m.accountRoutes) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
