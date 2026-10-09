import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Choice, Icon, Segmented } from '@aura/shared/ui';

export type ScheduleSegmentValue = 'upcoming' | 'past';

/** UPCOMING / PAST switch, search box and the staff-only + EVENT button. */
@Component({
  selector: 'aura-schedule-toolbar',
  imports: [Segmented, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-3' },
  template: `
    <aura-segmented [options]="segments" [value]="segment()" (valueChange)="segmentChange.emit($event)" />
    <div class="flex gap-2">
      <label class="search-box flex-1">
        <aura-icon name="search" [size]="18" />
        <span class="sr-only">Search events</span>
        <input type="search" placeholder="Search" [value]="query()" (input)="queryChange.emit(value($event))" />
      </label>
      @if (canCreate()) {
        <button type="button" class="btn-small h-11 rounded-lg px-3.5 text-[15px]" (click)="create.emit()">
          + EVENT
        </button>
      }
    </div>
  `,
})
export class ScheduleToolbar {
  readonly segment = input.required<ScheduleSegmentValue>();
  readonly query = input('');
  readonly canCreate = input(false);

  readonly segmentChange = output<ScheduleSegmentValue>();
  readonly queryChange = output<string>();
  readonly create = output<void>();

  protected readonly segments: Choice<ScheduleSegmentValue>[] = [
    { value: 'upcoming', label: 'UPCOMING' },
    { value: 'past', label: 'PAST' },
  ];

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
