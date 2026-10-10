import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { Avatar, Check, Sheet } from '@aura/shared/ui';

export interface DetailFieldVm {
  key: string;
  label: string;
  value: string;
  /** Shown as an input in edit mode. */
  editable: boolean;
  type?: 'text' | 'email';
  required?: boolean;
  /** Shown under the input in edit mode. */
  hint?: string;
  /** Only shown in edit mode (e.g. the name, which is already the heading). */
  editOnly?: boolean;
  /** A checklist instead of a text input, e.g. a player's parents. `value` is the display text. */
  options?: { id: string; label: string; sub: string }[];
  /** The ticked option ids. */
  selected?: string[];
}

/** Saved values by field key: text, or the ticked ids of a checklist. */
export type PersonDetailsValue = Record<string, string | string[]>;

export interface PersonDetailsVm {
  name: string;
  /** e.g. `Team Staff · U12 Girls`, `Player · #8 · U12 Girls`. */
  role: string;
  /** Players show their jersey instead of initials. */
  jersey?: string;
  invited: boolean;
  fields: DetailFieldVm[];
  canEdit: boolean;
  /** Resend or cancel their invite (only while invited). */
  canManageInvite: boolean;
}

/**
 * Someone on the roster: their details, and an EDIT button that turns the sheet into a form when
 * the viewer may edit them. Invites can be resent or cancelled from here.
 */
@Component({
  selector: 'aura-person-details',
  imports: [Sheet, Avatar, Check],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = vm();
    <aura-sheet [title]="editing() ? 'EDIT DETAILS' : v.invited ? 'INVITED' : 'DETAILS'" (closed)="closed.emit()">
      <div class="flex items-center gap-3">
        @if (v.jersey) {
          <span
            class="flex size-14 shrink-0 items-center justify-center rounded-md border-2 border-ink font-display text-2xl font-bold"
            >{{ v.jersey }}</span
          >
        } @else {
          <aura-avatar [name]="v.name" [size]="56" />
        }
        <div class="min-w-0">
          <div class="font-display text-[22px] leading-[1.1] font-bold uppercase">{{ v.name }}</div>
          <div class="text-sm font-medium">{{ v.role }}</div>
        </div>
      </div>

      @if (editing()) {
        @for (f of editableFields(); track f.key) {
          @if (f.options) {
            <div class="label-caps">{{ f.label }}</div>
            <div class="card">
              @for (o of f.options; track o.id) {
                @let ticked = (picked()[f.key] ?? []).includes(o.id);
                <button
                  type="button"
                  class="card-row py-[9px]"
                  [attr.aria-pressed]="ticked"
                  (click)="toggle(f.key, o.id)"
                >
                  <aura-check [checked]="ticked" />
                  <span class="min-w-0 flex-1">
                    <span class="block text-[15px] font-semibold">{{ o.label }}</span>
                    <span class="block text-xs">{{ o.sub }}</span>
                  </span>
                </button>
              }
            </div>
          } @else {
            <label class="field">
              {{ f.label }}
              <input
                class="field-input"
                [type]="f.type ?? 'text'"
                [value]="draft()[f.key] ?? ''"
                (input)="setDraft(f.key, $event)"
              />
            </label>
          }
          @if (f.hint) {
            <p class="-mt-1.5 text-[13px] leading-snug">{{ f.hint }}</p>
          }
        }
        @if (shownError()) {
          <div class="error-box" role="alert">⚠ {{ shownError() }}</div>
        }
        <button type="button" class="btn-primary mt-1" [disabled]="saving()" (click)="save()">SAVE</button>
        <button type="button" class="btn-link h-10 self-center" (click)="editing.set(false)">Back</button>
      } @else {
        <dl class="card">
          @for (f of viewFields(); track f.key) {
            <div class="card-row flex-col items-start gap-0.5">
              <dt class="label-caps">{{ f.label }}</dt>
              <dd class="text-[15px] font-medium break-all">{{ f.value }}</dd>
            </div>
          }
        </dl>
        @if (error()) {
          <div class="error-box" role="alert">⚠ {{ error() }}</div>
        }
        @if (v.canEdit) {
          <button type="button" class="btn-primary mt-1" (click)="editing.set(true)">EDIT</button>
        }
        @if (v.invited && v.canManageInvite) {
          @if (confirmingCancel()) {
            <div class="flex flex-col gap-2 rounded-md border-2 border-dashed border-ink p-3" role="group">
              <p class="text-[15px] font-medium">
                Cancel {{ v.name }}’s invite? Their temporary password stops working.
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button type="button" class="btn-outline h-11" (click)="confirmingCancel.set(false)">KEEP</button>
                <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="cancelInvite.emit()">
                  CANCEL INVITE
                </button>
              </div>
            </div>
          } @else {
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn-outline h-11" [disabled]="saving()" (click)="resend.emit()">
                RESEND INVITE
              </button>
              <button type="button" class="btn-outline h-11" (click)="confirmingCancel.set(true)">CANCEL INVITE</button>
            </div>
          }
        }
      }
    </aura-sheet>
  `,
})
export class PersonDetails {
  readonly vm = input.required<PersonDetailsVm>();
  readonly saving = input(false);
  readonly error = input('');

  /** The edited fields, by key. */
  readonly saved = output<PersonDetailsValue>();
  readonly resend = output<void>();
  readonly cancelInvite = output<void>();
  readonly closed = output<void>();

  /** Back to viewing whenever the person's details change (e.g. after saving). */
  protected readonly editing = linkedSignal({ source: this.vm, computation: () => false });
  protected readonly confirmingCancel = signal(false);
  protected readonly draft = linkedSignal<Record<string, string>>(() =>
    Object.fromEntries(this.vm().fields.map((f) => [f.key, f.value])),
  );
  protected readonly picked = linkedSignal<Record<string, string[]>>(() =>
    Object.fromEntries(
      this.vm()
        .fields.filter((f) => f.options)
        .map((f) => [f.key, f.selected ?? []]),
    ),
  );
  private readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected readonly viewFields = computed(() => this.vm().fields.filter((f) => !f.editOnly && f.value));
  protected readonly editableFields = computed(() => this.vm().fields.filter((f) => f.editable));

  protected setDraft(key: string, e: Event): void {
    const value = (e.target as HTMLInputElement).value;
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected toggle(key: string, id: string): void {
    this.picked.update((p) => {
      const now = p[key] ?? [];
      return { ...p, [key]: now.includes(id) ? now.filter((x) => x !== id) : [...now, id] };
    });
  }

  protected save(): void {
    const values: PersonDetailsValue = {};
    for (const f of this.editableFields()) {
      if (f.options) {
        values[f.key] = this.picked()[f.key] ?? [];
        continue;
      }
      const value = (this.draft()[f.key] ?? '').trim();
      if (f.required && !value) return this.validationError.set(`Enter ${f.label.toLowerCase()}.`);
      if (f.type === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) {
        return this.validationError.set('Enter a valid email.');
      }
      values[f.key] = value;
    }
    this.validationError.set('');
    this.saved.emit(values);
  }
}
