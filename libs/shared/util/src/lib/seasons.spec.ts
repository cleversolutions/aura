import {
  agedUp,
  currentSeason,
  formatSeasonSpan,
  nextSeasonName,
  seasonNameFor,
  suggestedTeamName,
  teamBadge,
  teamShortName,
} from './seasons';

describe('seasons and teams', () => {
  it('names seasons by school year, from August', () => {
    expect(seasonNameFor(new Date(2026, 9, 10))).toBe('2026–27');
    expect(seasonNameFor(new Date(2027, 2, 1))).toBe('2026–27');
    expect(seasonNameFor(new Date(2027, 7, 1))).toBe('2027–28');
    expect(seasonNameFor(new Date(2099, 8, 1))).toBe('2099–00');
  });

  it('suggests the next season’s name when it can', () => {
    expect(nextSeasonName('2026–27')).toBe('2027–28');
    expect(nextSeasonName('2026-2027')).toBe('2027–2028');
    expect(nextSeasonName('2026')).toBe('2027');
    expect(nextSeasonName('Spring league')).toBe('');
  });

  it('finds the current season', () => {
    expect(
      currentSeason([
        { id: 'a', name: 'Old', startedAt: '2025-09-01', endedAt: '2026-08-01' },
        { id: 'b', name: 'New', startedAt: '2026-08-01' },
      ])?.id,
    ).toBe('b');
    expect(currentSeason([])).toBeNull();
  });

  it('ages a team up a year, name included', () => {
    expect(agedUp({ name: 'U11 Boys Red', age: 'U11', division: 'Boys' })).toEqual({
      name: 'U12 Boys Red',
      age: 'U12',
      division: 'Boys',
    });
    expect(agedUp({ name: 'Masters', age: 'Adult' })).toEqual({ name: 'Masters', age: 'Adult' });
    expect(agedUp({ name: 'Red Team' })).toEqual({ name: 'Red Team' });
    // Only the whole word: U1 is not part of U11.
    expect(agedUp({ name: 'U1 and U11', age: 'U1' }).name).toBe('U2 and U11');
  });

  it('builds team names and badges', () => {
    expect(suggestedTeamName('U11', 'Boys')).toBe('U11 Boys');
    expect(suggestedTeamName(undefined, 'Mixed')).toBe('Mixed');
    expect(teamShortName({ name: 'U12 Girls', age: 'U12', division: 'Girls' })).toBe('U12G');
    expect(teamShortName({ name: 'U11 Boys Red', age: 'U11', division: 'Boys' })).toBe('U11B RED');
    expect(teamShortName({ name: 'Masters', age: 'Adult' })).toBe('MASTERS');
    expect(teamBadge({ name: 'U11 Boys Red', age: 'U11', division: 'Boys' })).toBe('U11B');
    expect(teamBadge({ name: 'Masters', age: 'Adult' })).toBe('AD');
    expect(teamBadge({ name: 'Red Rockets' })).toBe('RR');
  });

  it('describes when a season ran', () => {
    expect(formatSeasonSpan({ startedAt: '2026-10-10' })).toBe('Since Oct 10, 2026');
    expect(formatSeasonSpan({ startedAt: '2025-09-01', endedAt: '2026-08-01' })).toBe('Sep 1, 2025 – Aug 1, 2026');
  });
});
