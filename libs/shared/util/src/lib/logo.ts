import { ThemeColors, hexToRgb, luminance, rgbToHex } from './color';

/*
 * Browser-only helpers for club logos. They draw to a canvas, so they resolve to null
 * where canvas is unavailable (tests, SSR) and callers fall back to defaults.
 */

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function canvas(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  try {
    return c.getContext('2d') ?? null;
  } catch {
    return null;
  }
}

/**
 * The logo's two main colours as a theme: its most common opaque colour, and the most
 * common one clearly different from it (or black/white). The darker becomes `ink`.
 */
export async function readLogoColors(src: string): Promise<ThemeColors | null> {
  if (!canvas(1, 1)) return null;
  const img = await loadImage(src);
  if (!img) return null;
  const w0 = img.naturalWidth || 120;
  const h0 = img.naturalHeight || 120;
  const k = Math.min(1, 120 / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k));
  const h = Math.max(1, Math.round(h0 * k));
  const ctx = canvas(w, h);
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    // Bucket by 4 bits per channel, averaging the exact colours in each bucket.
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += d[i];
      e.g += d[i + 1];
      e.b += d[i + 2];
      buckets.set(key, e);
    }
    const ranked = [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .map((e) => rgbToHex([e.r / e.n, e.g / e.n, e.b / e.n]));
    if (!ranked.length) return null;
    const distance = (p: string, q: string) => {
      const [a, b] = [hexToRgb(p), hexToRgb(q)];
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };
    const first = ranked[0];
    const second = ranked.find((c) => distance(c, first) > 110) ?? (luminance(first) > 0.4 ? '#000000' : '#ffffff');
    return luminance(first) <= luminance(second) ? { ink: first, paper: second } : { ink: second, paper: first };
  } catch {
    // A cross-origin image taints the canvas.
    return null;
  }
}

/**
 * A square PNG app icon: the logo centred on `background` inside the maskable safe zone,
 * so launchers can crop it to a circle or rounded square.
 */
export async function renderAppIcon(src: string, background: string, size: number): Promise<string | null> {
  if (!canvas(1, 1)) return null;
  const img = await loadImage(src);
  const ctx = img && canvas(size, size);
  if (!img || !ctx) return null;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  const box = size * 0.6;
  const w0 = img.naturalWidth || box;
  const h0 = img.naturalHeight || box;
  const k = Math.min(box / w0, box / h0);
  const [w, h] = [w0 * k, h0 * k];
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return ctx.canvas.toDataURL('image/png');
}
