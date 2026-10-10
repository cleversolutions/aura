import type { Club } from '@aura/shared/models';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  orientation: 'portrait';
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

const DEFAULT_ICONS = { size192: '/icons/icon-192.png', size512: '/icons/icon-512.png' };

/**
 * The web app manifest for one club, for the backend to serve at `/<slug>/manifest.webmanifest`.
 *
 * Browsers tell installed apps apart by manifest `id`, so giving each club its own `id`,
 * `start_url` and `scope` (all `/<slug>/`) lets one device install several clubs as
 * separate apps, each with its own name, icon and colours. The scopes do not overlap,
 * so links inside each app stay in its window.
 */
export function clubManifest(club: Club): WebAppManifest {
  const base = `/${club.slug}/`;
  const icons = club.icons ?? DEFAULT_ICONS;
  return {
    id: base,
    name: club.name,
    short_name: club.name,
    description: `Schedules, RSVPs and team chat for ${club.name}.`,
    start_url: base,
    scope: base,
    display: 'standalone',
    orientation: 'portrait',
    background_color: club.paper,
    theme_color: club.ink,
    icons: [
      { src: icons.size192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: icons.size512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
