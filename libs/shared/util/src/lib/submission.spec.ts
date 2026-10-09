import { Submission, errorMessage } from './submission';

describe('Submission', () => {
  it('tracks saving and clears the error on success', async () => {
    const s = new Submission();
    let release!: () => void;
    const done = s.run(() => new Promise<void>((r) => (release = r)), 'Failed');
    expect(s.saving()).toBe(true);
    expect(await s.run(async () => undefined, 'Failed')).toBe(false);
    release();
    expect(await done).toBe(true);
    expect(s.saving()).toBe(false);
    expect(s.error()).toBe('');
  });

  it('records a failure message', async () => {
    const s = new Submission();
    expect(await s.run(() => Promise.reject(new Error('U13 Girls already exists.')), errorMessage('Nope'))).toBe(false);
    expect(s.error()).toBe('U13 Girls already exists.');
    await s.run(() => Promise.reject('x'), 'Could not save.');
    expect(s.error()).toBe('Could not save.');
    s.reset();
    expect(s.error()).toBe('');
  });
});
