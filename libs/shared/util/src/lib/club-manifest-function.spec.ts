import { manifestResponse } from '../../../../../functions/[slug]/manifest.webmanifest';

const env = { AURA_SUPABASE_URL: 'https://db.example', AURA_SUPABASE_ANON_KEY: 'anon' };
const panthers = {
  id: 'c2',
  slug: 'p7x2mn',
  name: 'Panthers',
  logo_url: 'clubs/panthers.svg',
  ink: '#1d2a6b',
  paper: '#f6c945',
  icon_192_url: 'https://db.example/a.png',
  icon_512_url: 'https://db.example/b.png',
};

describe('manifest Pages Function', () => {
  it('serves the club manifest from its public branding', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([panthers])));
    const res = await manifestResponse(env, 'p7x2mn', fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith(
      'https://db.example/rest/v1/club_public?slug=eq.p7x2mn&select=*',
      expect.objectContaining({ headers: expect.objectContaining({ apikey: 'anon' }) }),
    );
    expect(res.headers.get('Content-Type')).toBe('application/manifest+json');
    expect(await res.json()).toMatchObject({
      id: '/p7x2mn/',
      scope: '/p7x2mn/',
      name: 'Panthers',
      theme_color: '#1d2a6b',
      icons: [{ src: 'https://db.example/a.png' }, { src: 'https://db.example/b.png' }],
    });
  });

  it('404s for unknown or invalid slugs without querying for invalid ones', async () => {
    const fetcher = vi.fn(async () => new Response('[]'));
    expect((await manifestResponse(env, 'nope99', fetcher as unknown as typeof fetch)).status).toBe(404);
    expect((await manifestResponse(env, 'admin/../x', fetcher as unknown as typeof fetch)).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
