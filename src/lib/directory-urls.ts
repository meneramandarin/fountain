export type SluggedDirectoryRef = {
  id: number;
  slug?: string | null;
};

export function locationHref(
  location: SluggedDirectoryRef,
  context?: { treatment?: string | null },
) {
  const pathname = `/directory/locations/${location.slug || location.id}`;
  const treatment = context?.treatment?.trim();
  if (!treatment) {
    return pathname;
  }

  const params = new URLSearchParams({ treatment });
  return `${pathname}?${params.toString()}`;
}

export function practitionerHref(practitioner: SluggedDirectoryRef) {
  return `/directory/practitioners/${practitioner.slug || practitioner.id}`;
}
