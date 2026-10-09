import { signal } from '@angular/core';

/**
 * Saving/error state for a container that submits a presentational form.
 * Pass `saving()` and `error()` down as inputs; call `run()` from the form's `submitted` handler.
 */
export class Submission {
  private readonly savingState = signal(false);
  private readonly errorState = signal('');

  readonly saving = this.savingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Runs `task` unless one is already in flight. Returns true when it succeeded. */
  async run(task: () => Promise<unknown>, failureMessage: string | ((e: unknown) => string)): Promise<boolean> {
    if (this.savingState()) return false;
    this.savingState.set(true);
    this.errorState.set('');
    try {
      await task();
      return true;
    } catch (e) {
      this.errorState.set(typeof failureMessage === 'function' ? failureMessage(e) : failureMessage);
      return false;
    } finally {
      this.savingState.set(false);
    }
  }

  reset(): void {
    this.errorState.set('');
  }
}

/** Uses the error's own message when it has one. */
export function errorMessage(fallback: string): (e: unknown) => string {
  return (e) => (e instanceof Error && e.message ? e.message : fallback);
}
