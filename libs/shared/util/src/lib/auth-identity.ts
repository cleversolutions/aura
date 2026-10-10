/**
 * Club-scoped sign-in identities for Supabase Auth.
 *
 * Supabase Auth needs a globally unique email, but Aura usernames are only unique within a club.
 * Each club member therefore signs in with an address derived from (club id, username). The
 * username is hashed so the address is short, valid, and never a real-looking mailbox at someone
 * else's domain. The login domain is reserved (`.invalid`), so mail to it can never be delivered.
 *
 * Copied verbatim to supabase/functions/_shared/auth-identity.ts for the edge functions; the spec
 * checks the two copies agree. Changing the format or the domain changes every member's sign-in
 * address: existing auth users must be migrated with a one-off script.
 */

export const DEFAULT_LOGIN_DOMAIN = 'login.aura.invalid';

/** Usernames compare case-insensitively, ignoring surrounding spaces. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** `<club uuid>_<first 24 hex chars of sha256(username)>@<domain>`; the local part is 61 characters. */
export async function authEmailFor(
  clubId: string,
  username: string,
  loginDomain: string = DEFAULT_LOGIN_DOMAIN,
): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeUsername(username));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${clubId.toLowerCase()}_${hex.slice(0, 24)}@${loginDomain}`;
}
