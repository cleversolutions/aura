// Cloudflare Pages Function: `/<slug>/manifest.webmanifest`, the club's own web app manifest, so
// each club installs as its own app (see clubManifest in shared/util). Reads the public branding
// with the anon key; set AURA_SUPABASE_URL and AURA_SUPABASE_ANON_KEY in the Pages project.
import type { Club } from '../../libs/shared/models/src/lib/models';
import { clubManifest } from '../../libs/shared/util/src/lib/club-manifest';

interface Env {
  AURA_SUPABASE_URL: string;
  AURA_SUPABASE_ANON_KEY: string;
}

interface ClubPublicRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string;
  ink: string;
  paper: string;
  icon_192_url: string | null;
  icon_512_url: string | null;
}

const SLUG = /^[a-z0-9-]{4,32}$/;

export async function manifestResponse(env: Env, slug: string, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!SLUG.test(slug)) return new Response('Not found', { status: 404 });
  const res = await fetcher(
    `${env.AURA_SUPABASE_URL}/rest/v1/club_public?slug=eq.${encodeURIComponent(slug)}&select=*`,
    { headers: { apikey: env.AURA_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.AURA_SUPABASE_ANON_KEY}` } },
  );
  if (!res.ok) return new Response('Could not load the club', { status: 502 });
  const [row] = (await res.json()) as ClubPublicRow[];
  if (!row) return new Response('Not found', { status: 404 });
  const club: Club = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logo_url,
    ink: row.ink,
    paper: row.paper,
    ...(row.icon_192_url && row.icon_512_url
      ? { icons: { size192: row.icon_192_url, size512: row.icon_512_url } }
      : {}),
  };
  return new Response(JSON.stringify(clubManifest(club)), {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Short: branding changes should reach installed apps soon.
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export const onRequestGet = ({ params, env }: { params: { slug: string }; env: Env }): Promise<Response> =>
  manifestResponse(env, params.slug);
