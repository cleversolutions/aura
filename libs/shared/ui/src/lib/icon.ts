import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

export type IconName =
  | 'back'
  | 'ball'
  | 'calendar'
  | 'chat'
  | 'chevron-right'
  | 'close'
  | 'menu'
  | 'person-circle'
  | 'roster'
  | 'search'
  | 'send'
  | 'sliders'
  | 'trophy';

interface IconDef {
  /** SVG inner markup, drawn on a 24×24 grid. */
  body: string;
  stroke?: number;
  filled?: boolean;
}

const ICONS: Record<IconName, IconDef> = {
  back: { body: '<polyline points="15 5 8 12 15 19"/>', stroke: 2.5 },
  'chevron-right': { body: '<polyline points="9 5 16 12 9 19"/>', stroke: 2.5 },
  close: { body: '<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>', stroke: 2.5 },
  calendar: {
    body: '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
  },
  ball: {
    body: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M5.6 5.6c3 3 3 9.8 0 12.8"/><path d="M18.4 5.6c-3 3-3 9.8 0 12.8"/>',
  },
  trophy: {
    body: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3"/><path d="M17 6h3v1a3 3 0 0 1-3 3"/><line x1="12" y1="14" x2="12" y2="18"/><rect x="8" y="18" width="8" height="3"/>',
  },
  chat: { body: '<path d="M4 4h16v12H9l-5 4z"/>' },
  roster: {
    body: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/><circle cx="4.5" cy="10" r="2"/><circle cx="19.5" cy="10" r="2"/>',
  },
  menu: {
    body: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>',
    stroke: 2.2,
  },
  'person-circle': {
    body: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3.2"/><path d="M6 18.5c1.4-2.3 3.5-3.4 6-3.4s4.6 1.1 6 3.4"/>',
  },
  search: { body: '<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/>', stroke: 2.5 },
  send: { body: '<polygon points="3 3 22 12 3 21 6 12"/>', filled: true },
  sliders: {
    body: '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.5" fill="var(--color-paper)"/><circle cx="15" cy="17" r="2.5" fill="var(--color-paper)"/>',
  },
};

/** Inline line icon in `currentColor`. */
@Component({
  selector: 'aura-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `
    <svg
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.fill]="def().filled ? 'currentColor' : 'none'"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth() ?? def().stroke ?? 2"
      [innerHTML]="body()"
    ></svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(24);
  readonly strokeWidth = input<number>();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly def = computed(() => ICONS[this.name()]);
  // Icon bodies are compile-time constants above, never user input.
  protected readonly body = computed(() => this.sanitizer.bypassSecurityTrustHtml(this.def().body));
}
