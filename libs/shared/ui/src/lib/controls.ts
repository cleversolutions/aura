import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { initials } from '@aura/shared/util';

/**
 * The square tick used in pick lists. `implied` shows a dashed, outlined tick for
 * people who are already included some other way (e.g. through a team).
 */
@Component({
  selector: 'aura-check',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', class: 'inline-flex shrink-0' },
  template: `
    <span
      class="flex items-center justify-center rounded-[5px] border-2 border-ink font-bold"
      [class]="checked() ? 'bg-ink text-paper' : implied() ? 'border-dashed bg-paper text-ink' : 'bg-paper text-paper'"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.6"
      >✓</span
    >
  `,
})
export class Check {
  readonly checked = input(false);
  readonly implied = input(false);
  readonly size = input(24);
}

/** On/off switch drawn as a pill with a knob. Purely visual; wrap it in a button. */
@Component({
  selector: 'aura-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', class: 'inline-flex shrink-0' },
  template: `
    <span
      class="flex h-7 w-12 items-center rounded-full border-2 border-ink p-0.5"
      [class]="on() ? 'justify-end bg-ink' : 'justify-start bg-paper'"
    >
      <span class="size-5 rounded-full" [class]="on() ? 'bg-paper' : 'bg-ink'"></span>
    </span>
  `,
})
export class Switch {
  readonly on = input(false);
}

export interface Choice<T> {
  value: T;
  label: string;
}

/** Full-width segmented control (UPCOMING / PAST, PRACTICE / GAME / SPECIAL). */
@Component({
  selector: 'aura-segmented',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="radiogroup"
      class="grid overflow-hidden rounded-lg border-2 border-ink"
      [style.grid-template-columns]="'repeat(' + options().length + ', minmax(0, 1fr))'"
    >
      @for (o of options(); track o.value; let first = $first) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="o.value === value()"
          class="font-display font-bold tracking-[0.03em]"
          [class]="
            (o.value === value() ? 'bg-ink text-paper' : 'bg-paper text-ink') + (first ? '' : ' border-l-2 border-ink')
          "
          [style.height.px]="height()"
          [style.font-size.px]="fontSize()"
          (click)="value.set(o.value)"
        >
          {{ o.label }}
        </button>
      }
    </div>
  `,
})
export class Segmented<T> {
  readonly options = input.required<Choice<T>[]>();
  readonly value = model.required<T>();
  readonly height = input(44);
  readonly fontSize = input(18);
}

/** Wrapping row of pill buttons; single choice. */
@Component({
  selector: 'aura-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      role="radiogroup"
      class="flex flex-wrap gap-1.5"
      [class.flex-nowrap]="scroll()"
      [class.overflow-x-auto]="scroll()"
    >
      @for (o of options(); track o.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="o.value === value()"
          class="h-9 min-w-[52px] shrink-0 rounded-full border-2 border-ink px-3 text-sm font-semibold whitespace-nowrap"
          [class]="o.value === value() ? 'bg-ink text-paper' : 'bg-paper text-ink'"
          (click)="value.set(o.value)"
        >
          {{ o.label }}
        </button>
      }
    </div>
  `,
})
export class Chips<T> {
  readonly options = input.required<Choice<T>[]>();
  readonly value = model.required<T>();
  readonly scroll = input(false);
}

export type AvatarStyle = 'outline' | 'solid' | 'square-solid';

/** Initials in a circle (people) or rounded square (teams). */
@Component({
  selector: 'aura-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', class: 'inline-flex shrink-0' },
  template: `
    <span
      class="flex items-center justify-center font-display font-bold"
      [class]="classes()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="size() * 0.38"
      >{{ text() }}</span
    >
  `,
})
export class Avatar {
  readonly name = input('');
  /** Overrides initials, e.g. a team code. */
  readonly label = input<string>();
  readonly size = input(40);
  readonly look = input<AvatarStyle>('outline');
  protected readonly text = computed(() => this.label() ?? initials(this.name()));
  protected readonly classes = computed(() => {
    switch (this.look()) {
      case 'solid':
        return 'rounded-full bg-ink text-paper';
      case 'square-solid':
        return 'rounded-md bg-ink text-paper';
      default:
        return 'rounded-full border-2 border-ink';
    }
  });
}
