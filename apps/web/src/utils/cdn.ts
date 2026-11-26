/**
 * Cloudinary delivery URL with on-the-fly resize, automatic format and quality.
 * Non-Cloudinary URLs are returned unchanged.
 */
export function cdn(url: string | null | undefined, w: number, h: number = w): string | undefined {
  if (!url) return undefined;
  return url.includes('res.cloudinary.com') ? url.replace('/upload/', `/upload/c_fill,w_${w},h_${h},q_auto,f_auto/`) : url;
}

/** `srcset` for responsive square images at 1x/2x. */
export function cdnSet(url: string | null | undefined, w: number): string | undefined {
  if (!url || !url.includes('res.cloudinary.com')) return undefined;
  return `${cdn(url, w)} 1x, ${cdn(url, w * 2)} 2x`;
}
