export type SitemapLocationIndexabilitySignals = {
  slug?: string | null;
  title?: string | null;
  hasPlace: boolean;
  hasContact: boolean;
  hasOffering: boolean;
  hasImage: boolean;
  hasHours: boolean;
};

export const minimumSitemapLocationContentSignals = 2;

export function isSitemapLocationIndexable(
  location: SitemapLocationIndexabilitySignals,
) {
  if (!location.slug?.trim() || !location.title?.trim()) {
    return false;
  }

  const contentSignalCount = [
    location.hasPlace,
    location.hasContact,
    location.hasOffering,
    location.hasImage,
    location.hasHours,
  ].filter(Boolean).length;

  return contentSignalCount >= minimumSitemapLocationContentSignals;
}
