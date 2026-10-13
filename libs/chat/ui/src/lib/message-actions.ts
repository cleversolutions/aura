import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { Sheet } from '@aura/shared/ui';

/**
 * Edit or delete a message. Starts on the editor when the viewer may edit it (their own), else on
 * the delete confirmation (staff removing someone else's message).
 */
@Component({
  selector: 'aura-message-actions',
  imports: [Sheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aura-sheet [title]="confirming() ? 'DELETE MESSAGE' : 'EDIT MESSAGE'" (closed)="closed.emit()">
      @if (confirming()) {
        <p class="text-base leading-snug font-medium">
          @if (mine()) {
            Delete your message? Everyone in the thread will see “Message deleted” in its place.
          } @else {
            Delete {{ sender() }}’s message? Everyone in the thread will see “Message deleted” in its place.
          }
        </p>
        <blockquote class="rounded-md border-2 border-dashed border-ink px-3 py-2 text-[15px] leading-snug">
          {{ text() }}
        </blockquote>
        @if (shownError()) {
          <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
        }
        <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="deleted.emit()">DELETE</button>
        @if (canEdit()) {
          <button type="button" class="btn-outline h-12 text-lg" (click)="confirming.set(false)">BACK</button>
        }
      } @else {
        <label class="field">
          MESSAGE
          <textarea
            class="field-input min-h-[96px] py-2 leading-snug"
            [value]="draft()"
            (input)="draft.set(value($event))"
          ></textarea>
        </label>
        @if (shownError()) {
          <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
        }
        <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="save()">SAVE</button>
        @if (canDelete()) {
          <button type="button" class="btn-outline h-12 text-lg" (click)="confirming.set(true)">DELETE MESSAGE</button>
        }
      }
    </aura-sheet>
  `,
})
export class MessageActions {
  readonly text = input.required<string>();
  readonly sender = input('');
  readonly mine = input(false);
  readonly canEdit = input(false);
  readonly canDelete = input(false);
  readonly saving = input(false);
  readonly error = input('');

  readonly edited = output<string>();
  readonly deleted = output<void>();
  readonly closed = output<void>();

  protected readonly confirming = linkedSignal(() => !this.canEdit());
  protected readonly draft = linkedSignal(() => this.text());
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected value(e: Event): string {
    return (e.target as HTMLTextAreaElement).value;
  }

  protected save(): void {
    const text = this.draft().trim();
    if (!text) return this.validationError.set('Write a message, or delete it instead.');
    this.validationError.set('');
    if (text === this.text()) return this.closed.emit();
    this.edited.emit(text);
  }
}
