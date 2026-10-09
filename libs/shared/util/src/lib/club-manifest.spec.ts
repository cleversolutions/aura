import { Club } from '@aura/shared/models';
import { clubManifest } from './club-manifest';

const club = (slug: string, name: string): Club => ({
  id: slug,
  slug,
  name,
  logoUrl: 'logo.svg',
  ink: '#1d2a6b',
  paper: '#f6c945',
});

describe('clubManifest', () => {
  it('gives each club its own installable identity', () => {
    const spartans = clubManifest(club('k3v9qp', 'Spartans'));
    const panthers = clubManifest(club('p7x2mn', 'Panthers'));

    expect(spartans).toMatchObject({ id: '/k3v9qp/', start_url: '/k3v9qp/', scope: '/k3v9qp/', name: 'Spartans' });
    expect(panthers.id).not.toBe(spartans.id);
    expect(panthers.scope.startsWith(spartans.scope)).toBe(false);
    expect(panthers).toMatchObject({ theme_color: '#1d2a6b', background_color: '#f6c945' });
  });

  it('uses the club icons when generated, else the default ones', () => {
    expect(clubManifest(club('k3v9qp', 'Spartans')).icons[0].src).toBe('/icons/icon-192.png');
    const withIcons = clubManifest({ ...club('k3v9qp', 'Spartans'), icons: { size192: 'a.png', size512: 'b.png' } });
    expect(withIcons.icons.map((i) => i.src)).toEqual(['a.png', 'b.png']);
  });
});
