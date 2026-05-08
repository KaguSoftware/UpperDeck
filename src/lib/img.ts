/**
 * Returns a Supabase Storage image transform URL for the given width and quality.
 * Falls back to the original URL for non-Supabase URLs.
 */
export function imgUrl(
  url: string | null | undefined,
  width: number,
  quality = 80
): string | null {
  if (!url) return null;
  if (!url.includes("/storage/v1/object/public/")) return url;
  return `${url}?width=${width}&quality=${quality}&resize=cover`;
}
