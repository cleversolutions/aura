import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTestBackend } from '@aura/backend/mock';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import { Toaster } from '@aura/shared/util';
import { ChatListPage } from './chat-list-page';

async function render(initialUserId = 'dana') {
  TestBed.configureTestingModule({ providers: [provideTestBackend({ initialUserId }), provideRouter([])] });
  await TestBed.inject(ClubStore).load();
  const chat = TestBed.inject(ChatStore);
  await chat.load();
  const fixture = TestBed.createComponent(ChatListPage);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const click = (text: string, selector = 'button') =>
    Array.from(el.querySelectorAll<HTMLButtonElement>(selector))
      .find((b) => b.textContent?.includes(text))
      ?.click();
  return { fixture, el, chat, click };
}

describe('ChatListPage', () => {
  it('lists my threads with unread counts', async () => {
    const { el } = await render('jordan');
    const items = el.querySelectorAll('aura-thread-list-item');
    expect(items.length).toBe(8);
    expect(el.textContent).toContain('Priya: Zoe too if there is space. Pickup 5:30?');
  });

  it('creates a thread, toasts and opens it', async () => {
    const { fixture, el, chat, click } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    click('NEW THREAD');
    await fixture.whenStable();
    const name = el.querySelector<HTMLInputElement>('input[placeholder="e.g. Saturday carpool"]');
    if (!name) throw new Error('name input missing');
    name.value = 'Tournament drivers';
    name.dispatchEvent(new Event('input'));
    click('U12 Girls', 'button.card-row');
    await fixture.whenStable();
    click('CREATE THREAD');
    await fixture.whenStable();

    const created = chat.myThreads()[0].thread;
    expect(created.name).toBe('Tournament drivers');
    expect(TestBed.inject(Toaster).message()?.text).toBe(
      'Thread created with 11 members. New team members join automatically.',
    );
    expect(navigate).toHaveBeenCalledWith(['/', 'k3v9qp', 'chat', created.id]);
    expect(el.querySelector('aura-thread-form')).toBeNull();
  });

  it('mutes a thread from notification settings', async () => {
    const { fixture, el, chat } = await render('jordan');
    el.querySelector<HTMLButtonElement>('button[aria-label="Chat settings"]')?.click();
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('[role=switch]')?.click();
    await fixture.whenStable();
    expect(chat.isMuted(chat.myThreads()[0].thread.id)).toBe(true);
  });
});
