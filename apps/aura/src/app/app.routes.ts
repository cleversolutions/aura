import { Route } from '@angular/router';
import { TabShell } from './tab-shell';

export const appRoutes: Route[] = [
  {
    path: '',
    component: TabShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'schedule' },
      { path: 'schedule', loadChildren: () => import('@aura/schedule/feature').then((m) => m.scheduleRoutes) },
      { path: 'chat', loadChildren: () => import('@aura/chat/feature').then((m) => m.chatRoutes) },
      { path: 'roster', loadChildren: () => import('@aura/club/feature-roster').then((m) => m.rosterRoutes) },
      { path: 'more', loadChildren: () => import('@aura/club/feature-account').then((m) => m.accountRoutes) },
    ],
  },
  { path: '**', redirectTo: '' },
];
