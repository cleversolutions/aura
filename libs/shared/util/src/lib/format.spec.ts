import {
  eventSortKey,
  eventTitle,
  formatEventWhen,
  formatMessageTime,
  formatResult,
  initials,
  isUpcoming,
} from './format';

describe('format', () => {
  it('builds initials', () => {
    expect(initials('Jordan Smith')).toBe('JS');
    expect(initials('Ada Lovelace Byron')).toBe('AL');
    expect(initials('')).toBe('?');
  });

  it('titles events by type', () => {
    expect(eventTitle({ type: 'practice' })).toBe('Practice');
    expect(eventTitle({ type: 'game', opponent: 'Riverside Hawks' })).toBe('Game vs. Riverside Hawks');
    expect(eventTitle({ type: 'special', title: 'Awards Night' })).toBe('Awards Night');
  });

  it('formats when, including TBD', () => {
    expect(formatEventWhen({ tbd: true })).toBe('Date & time TBD');
    expect(formatEventWhen({ date: '2026-10-06', time: '18:00' })).toBe('Tue, Oct 6 · 6:00 PM');
  });

  it('treats TBD and today as upcoming', () => {
    expect(isUpcoming({ tbd: true }, '2026-10-05')).toBe(true);
    expect(isUpcoming({ date: '2026-10-05' }, '2026-10-05')).toBe(true);
    expect(isUpcoming({ date: '2026-10-04' }, '2026-10-05')).toBe(false);
  });

  it('sorts TBD events last', () => {
    const keys = [{ tbd: true }, { date: '2026-10-06', time: '09:00' }].map(eventSortKey).sort();
    expect(keys).toEqual(['2026-10-0609:00', '9999']);
  });

  it('formats results', () => {
    expect(formatResult({ us: 42, them: 38 })).toBe('W 42–38');
    expect(formatResult({ us: 55, them: 61 })).toBe('L 55–61');
    expect(formatResult({ us: 50, them: 50 })).toBe('T 50–50');
  });

  it('formats message times relative to now', () => {
    const now = new Date('2026-10-09T12:00:00');
    expect(formatMessageTime('2026-10-09T08:12:00', now)).toBe('8:12 AM');
    expect(formatMessageTime('2026-10-08T20:00:00', now)).toBe('Yesterday');
    expect(formatMessageTime('2026-10-05T20:00:00', now)).toBe('Mon');
    expect(formatMessageTime('2026-09-01T20:00:00', now)).toBe('Sep 1');
  });
});
