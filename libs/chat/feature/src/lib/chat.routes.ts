import { Routes } from '@angular/router';
import { ChatListPage } from './chat-list-page';

export const chatRoutes: Routes = [
  { path: '', component: ChatListPage, title: 'Chat' },
  {
    path: ':threadId',
    loadComponent: () => import('./thread-page').then((m) => m.ThreadPage),
    title: 'Chat',
    // A conversation takes the whole screen; the shell hides the tab bar.
    data: { fullscreen: true },
  },
];
