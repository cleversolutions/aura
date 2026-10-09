// @vitest-environment node
import * as edge from '../../../../../supabase/functions/_shared/auth-identity';
import { authEmailFor, normalizeUsername } from './auth-identity';

const SPARTANS = 'c0000000-0000-0000-0000-000000000001';
const PANTHERS = 'c0000000-0000-0000-0000-000000000002';

/** Computed independently (Python hashlib) so a change to the format is caught. */
const VECTORS: [clubId: string, username: string, email: string][] = [
  [SPARTANS, 'jordan.smith@email.com', `${SPARTANS}_6885228e551b8630e20a3f7d@login.aura.invalid`],
  [PANTHERS, 'jordan.smith@email.com', `${PANTHERS}_6885228e551b8630e20a3f7d@login.aura.invalid`],
  [SPARTANS, '  Jordan.Smith@Email.com ', `${SPARTANS}_6885228e551b8630e20a3f7d@login.aura.invalid`],
  [SPARTANS, 'zoë', `${SPARTANS}_2752b88686847fa5c86f47b9@login.aura.invalid`],
];

describe('authEmailFor', () => {
  it.each(VECTORS)('derives the sign-in address for %s / %j', async (clubId, username, email) => {
    expect(await authEmailFor(clubId, username)).toBe(email);
  });

  it('gives the same username at two clubs two identities', async () => {
    const [a, b] = await Promise.all([
      authEmailFor(SPARTANS, 'jordan.smith@email.com'),
      authEmailFor(PANTHERS, 'jordan.smith@email.com'),
    ]);
    expect(a).not.toBe(b);
  });

  it('keeps the local part within the 64-character limit', async () => {
    const email = await authEmailFor(SPARTANS, 'a'.repeat(300));
    expect(email.split('@')[0]).toHaveLength(61);
  });

  it('uses the configured login domain', async () => {
    expect(await authEmailFor(SPARTANS, 'sam', 'login.example.pages.dev')).toMatch(/@login\.example\.pages\.dev$/);
  });

  it('matches the edge functions copy', async () => {
    for (const [clubId, username] of VECTORS) {
      expect(await edge.authEmailFor(clubId, username)).toBe(await authEmailFor(clubId, username));
    }
    expect(edge.DEFAULT_LOGIN_DOMAIN).toBe('login.aura.invalid');
    expect(edge.normalizeUsername(' A@B ')).toBe(normalizeUsername(' A@B '));
  });
});
