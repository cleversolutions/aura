import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { Avatar, Check, Chips, Choice, Sheet } from '@aura/shared/ui';
import { isValidPhone } from '@aura/shared/util';

export interface DetailFieldVm {
  key: string;
  label: string;
  value: string;
  /** Shown as an input in edit mode. */
  editable: boolean;
  type?: 'text' | 'email' | 'tel';
  /** A text area, for notes; shown with its line breaks. */
  multiline?: boolean;
  /** Shown as a link when viewing, e.g. `tel:555-0134`. */
  href?: string;
  required?: boolean;
  /** Shown under the input in edit mode. */
  hint?: string;
  /** Only shown in edit mode (e.g. the name, which is already the heading). */
  editOnly?: boolean;
  /** A checklist instead of a text input, e.g. a player's parents. `value` is the display text. */
  options?: { id: string; label: string; sub: string }[];
  /** One of several, as chips, e.g. a player's team. `value` is the display text. */
  choices?: Choice<string>[];
  /** The ticked option ids, or the chosen choice. */
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
  /** Disabled: on record, but cannot sign in or take part. */
  disabled?: boolean;
  /** Give them a new temporary password (only once they have joined). */
  canResetPassword?: boolean;
  /** Disable, re-enable or remove them from the club. */
  canRemove?: boolean;
  /** A player a parent asked to link, waiting for the team's staff. */
  pending?: boolean;
  /** Approve or reject a link request, or take the player off the roster. */
  canManagePlayer?: boolean;
  /** Give the player their own sign-in (they have none yet). */
  canGiveSignIn?: boolean;
}

/** An action that asks first. */
type Confirming = 'cancel' | 'reset' | 'disable' | 'remove' | 'reject' | 'removePlayer' | 'signIn';

/**
 * Someone on the roster: their details, and an EDIT button that turns the sheet into a form when
 * the viewer may edit them. Invites can be resent or cancelled from here; members who have joined
 * can have their password reset, be disabled or re-enabled, or be removed from the club.
 */
@Component({
  selector: 'aura-person-details',
  imports: [Sheet, Avatar, Check, Chips],
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
          @if (f.choices) {
            <div class="label-caps">{{ f.label }}</div>
            <aura-chips [options]="f.choices" [value]="draft()[f.key] ?? ''" (valueChange)="choose(f.key, $event)" />
          } @else if (f.options) {
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
          } @else if (f.multiline) {
            <label class="field">
              {{ f.label }}
              <textarea
                class="field-input h-auto resize-none py-2.5 text-[15px] leading-normal font-normal"
                rows="3"
                [value]="draft()[f.key] ?? ''"
                (input)="setDraft(f.key, $event)"
              ></textarea>
            </label>
          } @else {
            <label class="field">
              {{ f.label }}
              <input
                class="field-input"
                [type]="f.type ?? 'text'"
                [attr.inputmode]="f.type === 'tel' ? 'tel' : null"
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
              <dd class="text-[15px] font-medium" [class]="f.multiline ? 'whitespace-pre-line' : 'break-all'">
                @if (f.href) {
                  <a class="underline underline-offset-2" [href]="f.href">{{ f.value }}</a>
                } @else {
                  {{ f.value }}
                }
              </dd>
            </div>
          }
        </dl>
        @if (error()) {
          <div class="error-box" role="alert">⚠ {{ error() }}</div>
        }
        @if (v.canEdit) {
          <button type="button" class="btn-primary mt-1" (click)="editing.set(true)">EDIT</button>
        }
        @if (v.pending && v.canManagePlayer && !confirming()) {
          <p class="text-[13px] leading-snug">
            A parent asked to link this player. Check their details (EDIT to correct them), then approve or reject.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn-outline h-11" (click)="confirming.set('reject')">REJECT</button>
            <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="approve.emit()">
              APPROVE
            </button>
          </div>
        }
        @if (confirming(); as action) {
          <div class="flex flex-col gap-2 rounded-md border-2 border-dashed border-ink p-3" role="group">
            <p class="text-[15px] font-medium">{{ confirmText()[action] }}</p>
            @if (action === 'signIn') {
              <label class="field">
                PLAYER’S EMAIL
                <input
                  class="field-input"
                  type="email"
                  placeholder="name@email.com"
                  [value]="signInEmail()"
                  (input)="signInEmail.set(value($event))"
                />
              </label>
              @if (validationError()) {
                <div class="error-box" role="alert">⚠ {{ validationError() }}</div>
              }
            }
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn-outline h-11" (click)="confirming.set(null)">
                {{ action === 'cancel' ? 'KEEP' : 'BACK' }}
              </button>
              <button type="button" class="btn-primary h-11" [disabled]="saving()" (click)="confirm(action)">
                {{ confirmLabel[action] }}
              </button>
            </div>
          </div>
        } @else {
          @if (v.invited && v.canManageInvite) {
            <div class="grid grid-cols-2 gap-2">
              <button type="button" class="btn-outline h-11" [disabled]="saving()" (click)="resend.emit()">
                RESEND INVITE
              </button>
              <button type="button" class="btn-outline h-11" (click)="confirming.set('cancel')">CANCEL INVITE</button>
            </div>
          }
          @if (!v.invited && v.canResetPassword) {
            <button type="button" class="btn-outline h-11" (click)="confirming.set('reset')">RESET PASSWORD</button>
          }
          @if (v.canGiveSignIn) {
            <button type="button" class="btn-outline h-11" (click)="confirming.set('signIn')">GIVE OWN SIGN-IN</button>
          }
          @if (!v.pending && v.canManagePlayer) {
            <button type="button" class="btn-outline h-11" (click)="confirming.set('removePlayer')">
              REMOVE FROM ROSTER
            </button>
          }
          @if (!v.invited && v.canRemove) {
            <div class="grid grid-cols-2 gap-2">
              @if (v.disabled) {
                <button type="button" class="btn-outline h-11" [disabled]="saving()" (click)="enable.emit()">
                  ENABLE
                </button>
              } @else {
                <button type="button" class="btn-outline h-11" (click)="confirming.set('disable')">DISABLE</button>
              }
              <button type="button" class="btn-outline h-11" (click)="confirming.set('remove')">
                REMOVE FROM CLUB
              </button>
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
  readonly resetPassword = output<void>();
  readonly disable = output<void>();
  readonly enable = output<void>();
  readonly remove = output<void>();
  readonly approve = output<void>();
  /** Rejects a link request, or takes the player off the roster. */
  readonly removePlayer = output<void>();
  /** The player's email, for their own sign-in. */
  readonly giveSignIn = output<string>();
  readonly closed = output<void>();

  /** Back to viewing whenever the person's details change (e.g. after saving). */
  protected readonly editing = linkedSignal({ source: this.vm, computation: () => false });
  /** Asking before an action; cleared whenever the person's details change. */
  protected readonly confirming = linkedSignal<PersonDetailsVm, Confirming | null>({
    source: this.vm,
    computation: () => null,
  });
  protected readonly confirmLabel: Record<Confirming, string> = {
    cancel: 'CANCEL INVITE',
    reset: 'RESET',
    disable: 'DISABLE',
    remove: 'REMOVE',
    reject: 'REJECT',
    removePlayer: 'REMOVE',
    signIn: 'CREATE SIGN-IN',
  };
  protected readonly confirmText = computed<Record<Confirming, string>>(() => {
    const name = this.vm().name;
    return {
      cancel: `Cancel ${name}’s invite? Their temporary password stops working.`,
      reset: `Give ${name} a new temporary password? Their current password stops working, and they choose a new one when they sign in.`,
      disable: `Disable ${name}? They can’t sign in or take part until they’re enabled again. Nothing is deleted.`,
      remove: `Remove ${name} from the club? Their sign-in is deleted and they’re unlinked from players, teams and chats. Their messages stay, from “Former member”. This can’t be undone.`,
      reject: `Reject the request to add ${name}? The request is deleted.`,
      removePlayer: `Take ${name} off the roster? Their RSVPs are deleted. Their parents, and their own sign-in if they have one, stay in the club.`,
      signIn: `Give ${name} their own sign-in, to RSVP and chat themselves? Their parents keep access.`,
    };
  });
  protected readonly draft = linkedSignal<Record<string, string>>(() =>
    Object.fromEntries(this.vm().fields.map((f) => [f.key, f.choices ? (f.selected?.[0] ?? '') : f.value])),
  );
  protected readonly signInEmail = linkedSignal({ source: this.vm, computation: () => '' });
  protected readonly picked = linkedSignal<Record<string, string[]>>(() =>
    Object.fromEntries(
      this.vm()
        .fields.filter((f) => f.options)
        .map((f) => [f.key, f.selected ?? []]),
    ),
  );
  protected readonly validationError = signal('');
  protected readonly shownError = computed(() => this.validationError() || this.error());

  protected readonly viewFields = computed(() => this.vm().fields.filter((f) => !f.editOnly && f.value));
  protected readonly editableFields = computed(() => this.vm().fields.filter((f) => f.editable));

  protected confirm(action: Confirming): void {
    if (action === 'signIn') {
      const email = this.signInEmail().trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return this.validationError.set('Enter the player’s email.');
      this.validationError.set('');
      return this.giveSignIn.emit(email);
    }
    const outputs = {
      cancel: this.cancelInvite,
      reset: this.resetPassword,
      disable: this.disable,
      remove: this.remove,
      reject: this.removePlayer,
      removePlayer: this.removePlayer,
    };
    outputs[action].emit();
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected choose(key: string, id: string): void {
    this.draft.update((d) => ({ ...d, [key]: id }));
  }

  protected setDraft(key: string, e: Event): void {
    const value = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
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
      if (f.choices) {
        values[f.key] = this.draft()[f.key] ?? '';
        continue;
      }
      const value = (this.draft()[f.key] ?? '').trim();
      if (f.required && !value) return this.validationError.set(`Enter ${f.label.toLowerCase()}.`);
      if (f.type === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) {
        return this.validationError.set('Enter a valid email.');
      }
      if (f.type === 'tel' && !isValidPhone(value)) return this.validationError.set('Enter a valid phone number.');
      values[f.key] = value;
    }
    this.validationError.set('');
    this.saved.emit(values);
  }
}
