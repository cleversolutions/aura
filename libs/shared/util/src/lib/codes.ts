/** Lowercase letters and digits that cannot be misread (no i, l, o, 0, 1). */
const SLUG_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const UPPER_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';

function pick(n: number, chars: string): string {
  const bytes = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Unguessable path segment for a club's link, e.g. `k3v9qp`. */
export function randomSlug(length = 6): string {
  return pick(length, SLUG_CHARS);
}

/** Readable one-time password, e.g. `KMRT-a7bq-49`. */
export function temporaryPassword(): string {
  return `${pick(4, UPPER_CHARS)}-${pick(4, SLUG_CHARS)}-${pick(2, DIGITS)}`;
}

export const SLUG_PATTERN = /^[a-z0-9-]{4,32}$/;
