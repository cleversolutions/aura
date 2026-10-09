import { Club } from '@aura/shared/models';
import { DEFAULT_THEME, themeTokens } from '@aura/shared/util';

const DEFAULT_MANIFEST = 'manifest.webmanifest';
const DEFAULT_TOUCH_ICON = 'icons/icon-192.png';

function setLink(doc: Document, rel: string, href: string): void {
  let link = doc.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = doc.createElement('link');
    link.rel = rel;
    doc.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}

/**
 * Dresses the page in the open club's colours and app identity, or Aura's defaults when
 * no club is open (landing page, platform admin).
 *
 * `manifestUrl` points at the club's own web app manifest (distinct `id`, `start_url`
 * and `scope` of `/<slug>/`), which is what lets each club install as a separate app.
 */
export function applyBranding(doc: Document, club: Club | null, manifestUrl: string | null): void {
  const colors = club ?? DEFAULT_THEME;
  const root = doc.documentElement;
  for (const [name, value] of Object.entries(themeTokens(colors))) root.style.setProperty(name, value);
  doc.head.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.ink);
  setLink(doc, 'manifest', manifestUrl ?? DEFAULT_MANIFEST);
  setLink(doc, 'apple-touch-icon', club?.icons?.size192 ?? DEFAULT_TOUCH_ICON);
}
