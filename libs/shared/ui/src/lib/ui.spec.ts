import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Check, Choice, Segmented } from './controls';
import { Sheet } from './sheet';
import { Toast } from './toast';

@Component({
  imports: [Segmented, Sheet],
  template: `
    <aura-segmented [options]="options" [(value)]="value" />
    @if (open()) {
      <aura-sheet title="TEST SHEET" (closed)="open.set(false)"><p id="body">Body</p></aura-sheet>
    }
  `,
})
class Host {
  options: Choice<string>[] = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ];
  value = signal('a');
  open = signal(true);
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, host: fixture.componentInstance };
}

describe('Segmented', () => {
  it('reflects and updates the bound value', async () => {
    const { fixture, el, host } = await render();
    const [a, b] = Array.from(el.querySelectorAll<HTMLButtonElement>('[role=radio]'));
    expect(a.getAttribute('aria-checked')).toBe('true');
    expect(a.classList).toContain('bg-ink');

    b.click();
    await fixture.whenStable();
    expect(host.value()).toBe('b');
    expect(b.getAttribute('aria-checked')).toBe('true');
    expect(b.classList).toContain('bg-ink');
    expect(a.classList).not.toContain('bg-ink');
  });
});

describe('Check', () => {
  it('is hidden from screen readers and adds no text to its row', async () => {
    const fixture = TestBed.createComponent(Check);
    fixture.componentRef.setInput('checked', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.textContent?.trim()).toBe('');
    expect(el.querySelector('svg')).not.toBeNull();
  });
});

describe('Sheet', () => {
  it('projects content and stays open when the panel is clicked', async () => {
    const { fixture, el, host } = await render();
    expect(el.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('TEST SHEET');
    el.querySelector<HTMLElement>('#body')?.click();
    await fixture.whenStable();
    expect(host.open()).toBe(true);
  });

  it('closes on backdrop click', async () => {
    const { fixture, el, host } = await render();
    el.querySelector<HTMLElement>('[role=dialog]')?.parentElement?.click();
    await fixture.whenStable();
    expect(host.open()).toBe(false);
  });

  it('closes on Escape', async () => {
    const { fixture, host } = await render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(host.open()).toBe(false);
  });
});

describe('Toast', () => {
  it('shows the message and emits dismissal on tap', async () => {
    const fixture = TestBed.createComponent(Toast);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role=status]')).toBeNull();

    fixture.componentRef.setInput('message', 'Score saved: 42–38');
    await fixture.whenStable();
    const dismissed = vi.fn();
    fixture.componentInstance.dismissed.subscribe(dismissed);
    el.querySelector<HTMLElement>('[role=status]')?.click();
    expect(el.textContent).toContain('Score saved: 42–38');
    expect(dismissed).toHaveBeenCalled();
  });
});
