import {
  MAX_WEEKS,
  daysBetween,
  eventSortKey,
  eventTitle,
  formatEventWhen,
  formatMessageTime,
  formatResult,
  formatTime,
  initials,
  isUpcoming,
  isValidPhone,
  mapLink,
  shiftDate,
  weeklyDates,
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

  it('formats end times, arrive-by times and map links', () => {
    expect(formatEventWhen({ date: '2026-10-06', time: '18:00', endTime: '19:30' })).toBe(
      'Tue, Oct 6 · 6:00 PM – 7:30 PM',
    );
    expect(formatTime('17:45')).toBe('5:45 PM');
    expect(mapLink(' Spartan Centre · Court 1 ')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Spartan%20Centre%20%C2%B7%20Court%201',
    );
  });

  it('counts weeks across months and clock changes', () => {
    expect(shiftDate('2026-10-27', 7)).toBe('2026-11-03');
    expect(daysBetween('2026-10-27', '2026-11-03')).toBe(7);
    expect(daysBetween('2026-11-03', '2026-11-02')).toBe(-1);
    expect(weeklyDates('2026-10-27', '2026-11-17')).toEqual(['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17']);
    expect(weeklyDates('2026-10-27', '2026-10-26')).toEqual([]);
    expect(weeklyDates('2026-01-01', '2030-01-01')).toHaveLength(MAX_WEEKS);
  });

  it('accepts optional phone numbers', () => {
    expect(isValidPhone('')).toBe(true);
    expect(isValidPhone('(555) 010-2030')).toBe(true);
    expect(isValidPhone('+1 555.010.2030')).toBe(true);
    expect(isValidPhone('555-01')).toBe(false);
    expect(isValidPhone('call me')).toBe(false);
  });
});
