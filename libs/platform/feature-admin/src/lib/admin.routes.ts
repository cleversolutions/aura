import { Routes } from '@angular/router';
import { AdminShell, platformAdminGuard } from './admin-shell';
import { AdminSignInPage } from './admin-sign-in-page';
import { ClubEditPage, ClubListPage } from './club-pages';

export const adminRoutes: Routes = [
  { path: 'sign-in', component: AdminSignInPage, title: 'Platform admin' },
  {
    path: '',
    component: AdminShell,
    canActivate: [platformAdminGuard],
    children: [
      { path: '', component: ClubListPage, title: 'Clubs' },
      { path: 'clubs/new', component: ClubEditPage, title: 'New club' },
      { path: 'clubs/:clubId', component: ClubEditPage, title: 'Club' },
    ],
  },
];
