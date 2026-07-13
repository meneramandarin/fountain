export type PilotTreatment = {
  id: number;
  slug: string;
  name: string;
  searchLabel: string;
  pluralLabel: string;
};

export type PilotPlace = {
  slug: string;
  locality: string;
  region: string;
  countryCode: string;
  countryName: string;
};

export type PilotTreatmentLocationPage = {
  treatment: PilotTreatment;
  place: PilotPlace;
};

const treatments = {
  dexa: {
    id: 3,
    slug: "dexa-scan",
    name: "DEXA scan",
    searchLabel: "DEXA Scan",
    pluralLabel: "DEXA scans",
  },
  ivDrip: {
    id: 21,
    slug: "iv-drip",
    name: "IV nutrient therapy",
    searchLabel: "IV Drip",
    pluralLabel: "IV drips",
  },
  fullBodyMri: {
    id: 1,
    slug: "full-body-mri",
    name: "Full-body MRI",
    searchLabel: "Full-Body MRI",
    pluralLabel: "full-body MRI scans",
  },
} satisfies Record<string, PilotTreatment>;

const places = {
  austin: usPlace("austin-tx", "Austin", "TX"),
  denver: usPlace("denver-co", "Denver", "CO"),
  losAngeles: usPlace("los-angeles-ca", "Los Angeles", "CA"),
  miami: usPlace("miami-fl", "Miami", "FL"),
  newYork: usPlace("new-york-ny", "New York", "NY"),
  sanDiego: usPlace("san-diego-ca", "San Diego", "CA"),
  sanFrancisco: usPlace("san-francisco-ca", "San Francisco", "CA"),
  seattle: usPlace("seattle-wa", "Seattle", "WA"),
} satisfies Record<string, PilotPlace>;

export const pilotTreatmentLocationPages: PilotTreatmentLocationPage[] = [
  page(treatments.dexa, places.austin),
  page(treatments.dexa, places.denver),
  page(treatments.dexa, places.miami),
  page(treatments.dexa, places.newYork),
  page(treatments.dexa, places.sanDiego),
  page(treatments.dexa, places.sanFrancisco),
  page(treatments.dexa, places.seattle),

  page(treatments.ivDrip, places.austin),
  page(treatments.ivDrip, places.denver),
  page(treatments.ivDrip, places.losAngeles),
  page(treatments.ivDrip, places.miami),
  page(treatments.ivDrip, places.newYork),
  page(treatments.ivDrip, places.sanDiego),
  page(treatments.ivDrip, places.sanFrancisco),

  page(treatments.fullBodyMri, places.austin),
  page(treatments.fullBodyMri, places.denver),
  page(treatments.fullBodyMri, places.losAngeles),
  page(treatments.fullBodyMri, places.miami),
  page(treatments.fullBodyMri, places.newYork),
  page(treatments.fullBodyMri, places.sanFrancisco),
];

export function findPilotTreatmentLocationPage(treatmentSlug: string, placeSlug: string) {
  return pilotTreatmentLocationPages.find(
    (candidate) => candidate.treatment.slug === treatmentSlug && candidate.place.slug === placeSlug,
  );
}

export function pilotTreatmentLocationHref(page: PilotTreatmentLocationPage) {
  return `/treatments/${page.treatment.slug}/${page.place.slug}`;
}

export function findPilotTreatmentLocationHref(input: {
  treatmentId: number;
  locality: string;
  region?: string | null;
  countryCode: string;
}) {
  const normalizedRegion = input.region?.trim().toUpperCase();
  const candidate = pilotTreatmentLocationPages.find(
    (page) =>
      page.treatment.id === input.treatmentId &&
      page.place.countryCode === input.countryCode.trim().toUpperCase() &&
      normalize(page.place.locality) === normalize(input.locality) &&
      (!normalizedRegion || page.place.region === normalizedRegion),
  );

  return candidate ? pilotTreatmentLocationHref(candidate) : null;
}

export function pilotPageTitle(page: PilotTreatmentLocationPage) {
  return `${page.treatment.searchLabel} in ${pilotPlaceLabel(page.place)}`;
}

export function pilotPlaceLabel(place: PilotPlace) {
  return `${place.locality}, ${place.region}`;
}

function page(treatment: PilotTreatment, place: PilotPlace): PilotTreatmentLocationPage {
  return { treatment, place };
}

function usPlace(slug: string, locality: string, region: string): PilotPlace {
  return {
    slug,
    locality,
    region,
    countryCode: "US",
    countryName: "United States",
  };
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}
