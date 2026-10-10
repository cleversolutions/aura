/**
 * Seeds a local Supabase with the mock backend's demo clubs (Spartans and Panthers) and the
 * platform admin, so the Supabase backend shows the same data as `provideMockBackend()`.
 *
 *   npm run db:seed              # after `npm run db:start`
 *   npm run db:seed -- --force   # also replace demo clubs changed since they were seeded
 *
 * Every account uses the password `password`. Re-running replaces the two demo clubs, but only if
 * nothing in them changed since this script seeded them (it keeps a fingerprint of each in
 * `tmp/seeded-clubs.json`); otherwise it stops, so hand-made test data isn't lost. Mock string ids
 * become UUIDs; both clubs keep their mock slugs (k3v9qp, p7x2mn) so documented links work.
 * Refuses to run against anything but localhost unless `--allow-remote` is passed.
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { DEMO_PASSWORD, DEMO_PLATFORM_ADMIN, createMockClubs } from '../libs/backend/mock/src/lib/clubs';
import {
  createPlatformAdmin,
  deleteClubs,
  deletePlatformAdmin,
  seedDemoClub,
} from '../libs/backend/supabase/src/lib/demo-clubs';
import { DEFAULT_LOGIN_DOMAIN } from '../libs/shared/util/src/lib/auth-identity';

function localEnv(): Record<string, string> {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8' });
  return Object.fromEntries(
    out
      .split('\n')
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => [m[1], m[2]]),
  );
}

const env = process.env['SUPABASE_URL'] ? process.env : localEnv();
const url = process.env['SUPABASE_URL'] ?? env['API_URL'];
const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? env['SERVICE_ROLE_KEY'];
const loginDomain = process.env['AURA_LOGIN_DOMAIN'] ?? DEFAULT_LOGIN_DOMAIN;
const force = process.argv.includes('--force');
if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or run `npm run db:start`.');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url) && !process.argv.includes('--allow-remote')) {
  throw new Error(`Refusing to seed ${url}: demo accounts all use the password "password". Pass --allow-remote.`);
}

const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

/** Fingerprints of the clubs as seeded, by club id. */
const FINGERPRINTS = 'tmp/seeded-clubs.json';

/**
 * Everything people can change in a club. Read state (thread_reads, thread_mutes) is left out:
 * browsing a demo club shouldn't stop it being reseeded.
 */
const CLUB_TABLES = [
  'teams',
  'members',
  'team_members',
  'player_profiles',
  'player_parents',
  'events',
  'rsvps',
  'threads',
  'thread_members',
  'messages',
];

async function fingerprint(clubId: string): Promise<string> {
  const hash = createHash('sha256');
  const club = await db.from('clubs').select().eq('id', clubId).single();
  if (club.error) throw new Error(`Read club: ${club.error.message}`);
  hash.update(JSON.stringify(club.data));
  for (const table of CLUB_TABLES) {
    const { data, error } = await db.from(table).select().eq('club_id', clubId);
    if (error) throw new Error(`Read ${table}: ${error.message}`);
    const rows = data.map((row) => JSON.stringify(row)).sort();
    hash.update(`${table}:${rows.join('\n')}`);
  }
  return hash.digest('hex');
}

function readFingerprints(): Record<string, string> {
  try {
    return existsSync(FINGERPRINTS) ? JSON.parse(readFileSync(FINGERPRINTS, 'utf8')) : {};
  } catch {
    return {};
  }
}

/** Names the existing demo clubs that differ from how this script left them. */
async function changedClubs(slugs: string[]): Promise<string[]> {
  const { data, error } = await db.from('clubs').select('id, slug, name').in('slug', slugs);
  if (error) throw new Error(`Find clubs: ${error.message}`);
  const seeded = readFingerprints();
  const changed: string[] = [];
  for (const club of data) {
    if (seeded[club.id] !== (await fingerprint(club.id))) changed.push(`${club.name} (/${club.slug})`);
  }
  return changed;
}

async function main(): Promise<void> {
  const clubs = createMockClubs(new Date());
  const slugs = clubs.map((c) => c.account.slug);
  console.log(`Seeding ${url}`);

  const changed = await changedClubs(slugs);
  if (changed.length && !force) {
    throw new Error(
      `Not replacing ${changed.join(' and ')}: changed since seeding (or seeded by another checkout), ` +
        'and reseeding would delete those changes. Run `npm run db:seed -- --force` to replace them anyway.',
    );
  }

  const existing = await db.from('clubs').select('id').in('slug', slugs);
  if (existing.error) throw new Error(`Find clubs: ${existing.error.message}`);
  await deleteClubs(
    db,
    existing.data.map((c) => c.id as string),
  );
  await deletePlatformAdmin(db, DEMO_PLATFORM_ADMIN.email);
  await createPlatformAdmin(db, DEMO_PLATFORM_ADMIN);
  console.log(`  Platform admin: ${DEMO_PLATFORM_ADMIN.email}`);

  const fingerprints: Record<string, string> = {};
  for (const club of clubs) {
    const seeded = await seedDemoClub(db, club, { loginDomain });
    fingerprints[seeded.id] = await fingerprint(seeded.id);
    console.log(
      `  ${seeded.name} (/${seeded.slug}): ${seeded.members} members, ${seeded.signIns} sign-ins, ` +
        `${seeded.events} events, ${seeded.threads} threads`,
    );
  }
  mkdirSync(dirname(FINGERPRINTS), { recursive: true });
  writeFileSync(FINGERPRINTS, JSON.stringify(fingerprints, null, 2));
  console.log(`Done. Every account's password is "${DEMO_PASSWORD}".`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
