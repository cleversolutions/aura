import { Routes } from '@angular/router';
import { ChatListPage } from './chat-list-page';

export const chatRoutes: Routes = [
  {
    path: '',
    component: ChatListPage,
    title: 'Chat',
    children: [
      {
        path: ':threadId',
        loadComponent: () => import('./thread-page').then((m) => m.ThreadPage),
        title: 'Chat',
        // On compact screens a conversation takes the whole screen; the shell hides the tab bar.
        // Wide screens show it beside the thread list.
        data: { fullscreen: true },
      },
    ],
  },
];
