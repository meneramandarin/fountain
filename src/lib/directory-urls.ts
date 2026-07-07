export type SluggedDirectoryRef = {
  id: number;
  slug?: string | null;
};

export function locationHref(location: SluggedDirectoryRef) {
  return `/directory/locations/${location.slug || location.id}`;
}

export function practitionerHref(practitioner: SluggedDirectoryRef) {
  return `/directory/practitioners/${practitioner.slug || practitioner.id}`;
}
