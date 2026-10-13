import { ClubEvent, RsvpStatus } from '@aura/shared/models';

/** Up to two upper-case initials, e.g. `Jordan Smith` → `JS`. */
export function initials(name: string | null | undefined): string {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function firstName(name: string): string {
  return name.split(' ')[0];
}

/** Local calendar date as `YYYY-MM-DD`. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function eventTitle(e: Pick<ClubEvent, 'type' | 'opponent' | 'title'>): string {
  if (e.type === 'practice') return 'Practice';
  if (e.type === 'game') return `Game vs. ${e.opponent ?? 'TBD'}`;
  return e.title ?? 'Event';
}

/** `Tue, Oct 6 · 6:00 PM`, `Tue, Oct 6 · 6:00 PM – 7:30 PM` with an end time, or `Date & time TBD`. */
export function formatEventWhen(e: Pick<ClubEvent, 'date' | 'time' | 'tbd' | 'endTime'>): string {
  if (e.tbd || !e.date) return 'Date & time TBD';
  const dt = new Date(`${e.date}T${e.time || '12:00'}`);
  const day = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!e.time) return day;
  return `${day} · ${formatClock(dt)}` + (e.endTime ? ` – ${formatTime(e.endTime)}` : '');
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** A 24h `HH:mm` time as `5:45 PM`. */
export function formatTime(hhmm: string): string {
  return formatClock(new Date(`2000-01-01T${hhmm}`));
}

/** A map search for an event's location, e.g. `Lincoln MS Gym, Riverside`. */
export function mapLink(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}

/** `YYYY-MM-DD` moved by whole days (calendar days, whatever the clocks do). */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

/** Whole days from `from` to `to` (`YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.UTC(...ymd(to)) - Date.UTC(...ymd(from))) / 86_400_000);
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

/** Most weeks a repeating event is created for at once: a season. */
export const MAX_WEEKS = 52;

/** The same weekday every week from `start` until `until` (inclusive), at most `MAX_WEEKS` dates. */
export function weeklyDates(start: string, until: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= until && dates.length < MAX_WEEKS; d = shiftDate(d, 7)) dates.push(d);
  return dates;
}

/**
 * An optional phone number: empty, or digits with spaces, `+`, `-`, `.` and brackets, with at least
 * 7 digits and at most 30 characters. Mirrored in supabase/functions/update-member.
 */
export function isValidPhone(phone: string): boolean {
  const p = phone.trim();
  return !p || (p.length <= 30 && /^[0-9+().\-\s]+$/.test(p) && (p.match(/\d/g) ?? []).length >= 7);
}

/** TBD events are always upcoming; dated events are upcoming from their day onwards. */
export function isUpcoming(e: Pick<ClubEvent, 'date' | 'tbd'>, today: string): boolean {
  return !!e.tbd || !e.date || e.date >= today;
}

/** Chronological sort key; TBD events sort last. */
export function eventSortKey(e: Pick<ClubEvent, 'date' | 'time' | 'tbd'>): string {
  return e.tbd || !e.date ? '9999' : e.date + (e.time ?? '');
}

/** Win/loss line for a finished game, e.g. `W 42–38`. */
export function formatResult(score: { us: number; them: number }): string {
  const r = score.us > score.them ? 'W' : score.us < score.them ? 'L' : 'T';
  return `${r} ${score.us}–${score.them}`;
}

export const RSVP_LABEL: Record<RsvpStatus, string> = { going: 'GOING', out: 'OUT' };

/** Message timestamp: time today, `Yesterday`, weekday within a week, else a short date. */
export function formatMessageTime(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((new Date(isoDate(now)).getTime() - new Date(isoDate(d)).getTime()) / 86_400_000);
  if (days <= 0) return formatClock(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Display name for a team id, or `Club-wide` for club-scoped items. */
export function teamLabel(teams: readonly { id: string; name: string }[], id: string): string {
  if (id === 'ALL' || id === 'club') return 'Club-wide';
  return teams.find((t) => t.id === id)?.name ?? id;
}

/** Who sent a message whose sender has been removed from the club (or is unknown). */
export const FORMER_MEMBER = 'Former member';
