import { Season, Team } from '@aura/shared/models';
import { initials } from './format';

/** Age groups offered for a team; optional, and only a suggestion for its name. */
export const TEAM_AGES = [
  'U6',
  'U7',
  'U8',
  'U9',
  'U10',
  'U11',
  'U12',
  'U13',
  'U14',
  'U15',
  'U16',
  'U17',
  'U18',
  'U19',
  'Adult',
];
/** Divisions offered for a team; optional. */
export const TEAM_DIVISIONS = ['Boys', 'Girls', 'Mixed'];

/** A team name from its age and division, e.g. `U11 Boys`; empty when neither is set. */
export function suggestedTeamName(age: string | undefined, division: string | undefined): string {
  return [age, division].filter(Boolean).join(' ');
}

/**
 * The season name for a date, as the database names a club's first season: school years run from
 * August, so 2026-10-10 is `2026–27` and 2027-03-01 is `2026–27` too.
 */
export function seasonNameFor(date: Date): string {
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The name after `name`: `2026–27` → `2027–28`, `2026` → `2027`; otherwise empty, to be typed. */
export function nextSeasonName(name: string): string {
  const span = /^(\d{4})\s*[–-]\s*(\d{2}|\d{4})$/.exec(name.trim());
  if (span) {
    const start = Number(span[1]) + 1;
    const end = span[2].length === 2 ? String((start + 1) % 100).padStart(2, '0') : String(start + 1);
    return `${start}–${end}`;
  }
  const year = /^(\d{4})$/.exec(name.trim());
  return year ? String(Number(year[1]) + 1) : '';
}

/** The club's current season: the one that has not ended. */
export function currentSeason(seasons: readonly Season[]): Season | null {
  return seasons.find((s) => !s.endedAt) ?? null;
}

/**
 * A team as it carries into the next season with its players: a year older, so `U11` becomes
 * `U12` in its age and its name (`U11 Boys Red` → `U12 Boys Red`). Adults and teams without an
 * age keep theirs.
 */
export function agedUp(team: Pick<Team, 'name' | 'age' | 'division'>): Pick<Team, 'name' | 'age' | 'division'> {
  const match = team.age ? /^U(\d+)$/.exec(team.age) : null;
  if (!match) return { ...team };
  const age = `U${Number(match[1]) + 1}`;
  const name = team.name.replace(new RegExp(`\\b${team.age}\\b`), age);
  return { ...team, age, name };
}

/** `Since Oct 10, 2026`, or `Sep 1, 2025 – Aug 1, 2026` for an ended season. */
export function formatSeasonSpan(season: Pick<Season, 'startedAt' | 'endedAt'>): string {
  const day = (iso: string) =>
    new Date(`${iso}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return season.endedAt ? `${day(season.startedAt)} – ${day(season.endedAt)}` : `Since ${day(season.startedAt)}`;
}

/**
 * A short badge label: `U11B` for `U11 Boys`, `U11B RED` for `U11 Boys Red`, otherwise the name in
 * capitals.
 */
export function teamShortName(team: Pick<Team, 'name' | 'age' | 'division'>): string {
  const prefix = suggestedTeamName(team.age, team.division);
  if (team.age && team.division && team.name.startsWith(prefix)) {
    return `${team.age}${team.division[0]}${team.name.slice(prefix.length)}`.toUpperCase();
  }
  return team.name.toUpperCase();
}

/** A team's square avatar: `U11B` from its age and division, its age alone, or its initials. */
export function teamBadge(team: Pick<Team, 'name' | 'age' | 'division'>): string {
  if (team.age) return team.age === 'Adult' ? 'AD' + (team.division?.[0] ?? '') : team.age + (team.division?.[0] ?? '');
  return initials(team.name);
}
