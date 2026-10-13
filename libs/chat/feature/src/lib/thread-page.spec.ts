import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestBackend } from '@aura/backend/mock';
import { ChatStore } from '@aura/chat/data-access';
import { ClubStore } from '@aura/club/data-access';
import { Toaster } from '@aura/shared/util';
import { ThreadPage } from './thread-page';

async function render(initialUserId: string, threadId: string) {
  TestBed.configureTestingModule({ providers: [provideTestBackend({ initialUserId }), provideRouter([])] });
  await TestBed.inject(ClubStore).load();
  const chat = TestBed.inject(ChatStore);
  await chat.load();
  const fixture = TestBed.createComponent(ThreadPage);
  fixture.componentRef.setInput('threadId', threadId);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const click = (text: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes(text))
      ?.click();
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  return { fixture, el, chat, click, settle };
}

describe('ThreadPage', () => {
  it('keeps a removed member’s messages, from a former member', async () => {
    const { el, settle } = await render('sam', 'U12G-gen');
    expect(el.textContent).toContain('Priya Patel');
    await TestBed.inject(ClubStore).removeMember('priya-patel');
    await settle();
    expect(el.textContent).toContain('Former member');
    expect(el.textContent).toContain('Does anyone have spare size 6 court shoes?');
    expect(el.textContent).not.toContain('Priya Patel');
  });

  it('hides the composer from parents in announcement channels', async () => {
    const { el } = await render('jordan', 'U12G-ann');
    expect(el.querySelector('aura-message-composer')).toBeNull();
    expect(el.textContent).toContain('Only club staff and U12 Girls staff post announcements.');
  });

  it('lets the team’s staff post announcements', async () => {
    const { el } = await render('dana', 'U12G-ann');
    expect(el.querySelector('aura-message-composer')).not.toBeNull();
  });

  it('lets club staff post in any team channel, and everyone read the club channel', async () => {
    expect((await render('sam', 'U18B-gen')).el.querySelector('aura-message-composer')).not.toBeNull();
    TestBed.resetTestingModule();
    const { el } = await render('wei-chen', 'club-ann');
    expect(el.textContent).toContain('Club-wide');
    expect(el.textContent).toContain('Only club staff post in club announcements.');
  });

  it('edits my own message from its actions', async () => {
    const { el, chat, click, settle } = await render('jordan', 'carpool');
    const actions = el.querySelectorAll<HTMLButtonElement>('[aria-label="Message actions"]');
    expect(actions).toHaveLength(1); // only Jordan's own message
    actions[0].click();
    await settle();
    const area = el.querySelector('textarea') as HTMLTextAreaElement;
    area.value = 'I can drive Thursday. Room for one more.';
    area.dispatchEvent(new Event('input'));
    click('SAVE');
    await settle();
    expect(TestBed.inject(Toaster).message()?.text).toBe('Message edited.');
    expect(chat.openThread()?.thread.messages[0].text).toBe('I can drive Thursday. Room for one more.');
    expect(el.textContent).toContain('· edited');
    expect(el.querySelector('aura-message-actions')).toBeNull();
  });

  it('lets team staff delete a parent’s message in their team’s channel', async () => {
    const { el, click, settle } = await render('dana', 'U12G-gen');
    const before = el.querySelectorAll('[aria-label="Message actions"]').length;
    expect(before).toBeGreaterThan(0);
    el.querySelector<HTMLButtonElement>('[aria-label="Message actions"]')?.click();
    await settle();
    click('DELETE');
    await settle();
    expect(TestBed.inject(Toaster).message()?.text).toBe('Message deleted.');
    expect(el.textContent).toContain('Message deleted');
  });
});
