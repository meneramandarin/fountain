import { describe, expect, test, vi } from "vitest";

// @ts-expect-error The production matcher is intentionally a native .mjs module.
import { GENERIC_DOMAINS, haversineMeters, locationSlugBase, matchLocation, normalizeLocality, normalizeName, normalizeWebsiteDomain, scoreLocationCandidates, trigramSimilarity } from "../pipeline/lib/matcher.mjs";

type LocationInput = {
  name: string;
  website: string | null;
  lat: number | null;
  lng: number | null;
  locality: string | null;
  country_code: string | null;
  slug?: string | null;
};

type LocationCandidate = LocationInput & {
  id: number;
  latitude: number | null;
  longitude: number | null;
  org_website_domain?: string | null;
  status?: string | null;
  deleted_at?: string | null;
};

type MatchMethod =
  | "website_domain_locality"
  | "name_locality_country"
  | "lat_lng_100m"
  | "name_geo";

type HistoricalFixture = {
  label: string;
  provenance: string;
  incoming: LocationInput;
  candidates: LocationCandidate[];
  expected: {
    status: "matched" | "review";
    method: MatchMethod;
    locationId: number;
  };
};

const HYPERBARIC_AUDIT =
  "fountain_raw.hyperbaric_app_promotion_audit_20260710 audited_at=2026-07-10T08:03:31.043057Z";

function candidate(
  row: Omit<LocationCandidate, "latitude" | "longitude">,
): LocationCandidate {
  return {
    ...row,
    latitude: row.lat,
    longitude: row.lng,
  };
}

const websiteDomainLocalityFixtures: HistoricalFixture[] = [
  {
    label: "audit 7 / source listing 18921753 / Halcyon Life",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Halcyon Life",
      website: "https://yourhbot.com",
      lat: 40.7480733,
      lng: -73.9845923,
      locality: "New York",
      country_code: "US",
      slug: "halcyon-life-new-york",
    },
    candidates: [candidate({
      id: 259,
      name: "Halcyon Life",
      website: "https://www.yourhbot.com/",
      lat: 40.7480733,
      lng: -73.9845923,
      locality: "New York",
      country_code: "US",
      slug: "halcyon-life-new-york",
    })],
    expected: { status: "matched", method: "website_domain_locality", locationId: 259 },
  },
  {
    label: "audit 9 / source listing 22475267 / AZ Wound",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "AZ Wound & Hyperbaric Medicine",
      website: "https://azwound.com",
      lat: 33.6397781,
      lng: -111.9989188,
      locality: "Phoenix",
      country_code: "US",
      slug: "az-wound-hyperbaric-medicine-phoenix-2",
    },
    candidates: [candidate({
      id: 13526,
      name: "AZ Wound & Hyperbaric Medicine",
      website: "https://azwound.com/",
      lat: 33.6397781,
      lng: -111.9989188,
      locality: "Phoenix",
      country_code: "US",
      slug: "az-wound-hyperbaric-medicine-phoenix",
    })],
    expected: { status: "matched", method: "website_domain_locality", locationId: 13526 },
  },
  {
    label: "audit 10 / source listing 23053986 / Tony Ridley",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Tony Ridley Hyperbaric Associates Ltd",
      website: "http://www.hyperbaric-tunnelling.com",
      lat: 52.6059002,
      lng: 1.405895,
      locality: "Norwich",
      country_code: "GB",
      slug: "tony-ridley-hyperbaric-associates-ltd-norwich",
    },
    candidates: [candidate({
      id: 13461,
      name: "Tony Ridley Hyperbaric Associates Ltd",
      website: "http://www.hyperbaric-tunnelling.com",
      lat: 52.6059002,
      lng: 1.405895,
      locality: "Norwich",
      country_code: "GB",
      slug: "tony-ridley-hyperbaric-associates-ltd-norwich",
    })],
    expected: { status: "matched", method: "website_domain_locality", locationId: 13461 },
  },
  {
    label: "audit 12 / source listing 27023063 / Biowell Health",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Biowell Health",
      website: "https://www.biowell.health",
      lat: 51.4825,
      lng: -0.1488,
      locality: "London",
      country_code: "GB",
      slug: "biowell-health-london",
    },
    candidates: [candidate({
      id: 1675,
      name: "Biowell Health",
      website: "https://www.biowell.health/",
      lat: 51.4817956,
      lng: -0.1461537,
      locality: "London",
      country_code: "GB",
      slug: "biowell-health-london",
    })],
    expected: { status: "matched", method: "website_domain_locality", locationId: 1675 },
  },
  {
    label: "audit 55 / source listing 93234849 / CEO2 Health",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "CEO2 Health",
      website: "https://www.ceo2health.com",
      lat: 34.1008783,
      lng: -118.3252191,
      locality: "Los Angeles",
      country_code: "US",
      slug: "ceo2-health-hollywood",
    },
    candidates: [candidate({
      id: 1429,
      name: "CEO2 Health",
      website: "https://www.ceo2health.com/",
      lat: 34.1009554,
      lng: -118.3258303,
      locality: "Los Angeles",
      country_code: "US",
      slug: "ceo2-health-los-angeles",
    })],
    expected: { status: "matched", method: "website_domain_locality", locationId: 1429 },
  },
];

const nameLocalityCountryFixtures: HistoricalFixture[] = [
  {
    label: "audit 14 / source listing 29151320 / Hipermed",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Hipermed: Medicina Física, Cámara Hiperbárica",
      website: null,
      lat: 19.4633862,
      lng: -99.1521795,
      locality: "Mexico City",
      country_code: "MX",
      slug: "hipermed-medicina-fisica-camara-hiperbarica-mexico-city",
    },
    candidates: [candidate({
      id: 13528,
      name: "Hipermed: Medicina Física, Cámara Hiperbárica",
      website: null,
      lat: 19.4633862,
      lng: -99.1521795,
      locality: "Mexico City",
      country_code: "MX",
      slug: "hipermed-medicina-f-sica-c-mara-hiperb-rica-mexico-city",
    })],
    expected: { status: "matched", method: "name_locality_country", locationId: 13528 },
  },
  {
    label: "audit 122 / source listing 207329839 / Hyperbaric Louth",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Hyperbaric Louth",
      website: null,
      lat: 54.0008611,
      lng: -6.4729079,
      locality: "Dundalk",
      country_code: "IE",
      slug: "hyperbaric-louth-dundalk",
    },
    candidates: [candidate({
      id: 2311,
      name: "Hyperbaric Louth",
      website: "https://hyperbaric.app/clinic/hyperbaric-louth-dundalk",
      lat: 54.0008611,
      lng: -6.4729079,
      locality: "Dundalk",
      country_code: "IE",
      slug: "hyperbaric-louth-dundalk",
    })],
    expected: { status: "matched", method: "name_locality_country", locationId: 2311 },
  },
  {
    label: "audit 458 / source listing 752612646 / Cairo",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Hyperbaric oxygen treatment centre",
      website: null,
      lat: 30.0543046,
      lng: 31.2157312,
      locality: "Cairo",
      country_code: "EG",
      slug: "hyperbaric-oxygen-treatment-centre-cairo",
    },
    candidates: [candidate({
      id: 13842,
      name: "Hyperbaric oxygen treatment centre",
      website: null,
      lat: 30.0176561,
      lng: 31.4345968,
      locality: "Cairo",
      country_code: "EG",
      slug: "hyperbaric-oxygen-treatment-centre-cairo",
    })],
    expected: { status: "matched", method: "name_locality_country", locationId: 13842 },
  },
  {
    label: "audit 654 / source listing 1160043193 / HMS Randolph",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Hyperbaric Medical Solutions",
      website: "https://www.instagram.com/hmshbot",
      lat: 42.1626,
      lng: -71.0409,
      locality: "Randolph",
      country_code: "US",
      slug: "hyperbaric-medical-solutions-randolph",
    },
    candidates: [candidate({
      id: 3272,
      name: "Hyperbaric Medical Solutions",
      website: "https://hyperbaricmedicalsolutions.com/",
      lat: 42.1626042,
      lng: -71.0413284,
      locality: "Randolph",
      country_code: "US",
      slug: "hyperbaric-medical-solutions-randolph",
    })],
    expected: { status: "matched", method: "name_locality_country", locationId: 3272 },
  },
  {
    label: "audit 1171 / source listing 2062504748 / REBASE",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "REBASE",
      website: null,
      lat: 51.5074456,
      lng: -0.1277653,
      locality: "London",
      country_code: "GB",
      slug: "rebase-london",
    },
    candidates: [candidate({
      id: 1683,
      name: "Rebase",
      website: "https://rebaserecovery.com/",
      lat: 51.518879,
      lng: -0.1521481,
      locality: "London",
      country_code: "GB",
      slug: "rebase-london",
    })],
    expected: { status: "matched", method: "name_locality_country", locationId: 1683 },
  },
];

// These five audited rows are intentionally the safe geo examples requested for
// the regression set: audit ids 5, 68, 137, 146, and 148.
const latLngFixtures: HistoricalFixture[] = [
  {
    label: "audit 5 / source listing 10019086 / Brook Park",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Hyperbaric Therapy Of Brook Park",
      website: "http://www.oxygenairtherapy.com",
      lat: 41.4042706,
      lng: -81.8089637,
      locality: "Columbus",
      country_code: "US",
      slug: "hyperbaric-therapy-of-brook-park-columbus",
    },
    candidates: [candidate({
      id: 4900,
      name: "Hyperbaric Therapy Of Brook Park",
      website: "https://oxygenairtherapy.com/",
      lat: 41.4042706,
      lng: -81.8089637,
      locality: "Brook Park",
      country_code: "US",
      slug: "hyperbaric-therapy-of-brook-park-cleveland",
    })],
    expected: { status: "matched", method: "lat_lng_100m", locationId: 4900 },
  },
  {
    label: "audit 68 / source listing 104411164 / Pittsburgh Hyperbarics",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "Pittsburgh Hyperbarics",
      website: "https://www.pittsburghhyperbaric.net",
      lat: 40.357479,
      lng: -80.112319,
      locality: "Pittsburgh",
      country_code: "US",
      slug: "pittsburgh-hyperbarics-pittsburgh",
    },
    candidates: [candidate({
      id: 2383,
      name: "Pittsburgh Hyperbarics",
      website: "https://www.pittsburghhyperbaric.net/",
      lat: 40.357479,
      lng: -80.112319,
      locality: "Bridgeville",
      country_code: "US",
      slug: "pittsburgh-hyperbarics",
    })],
    expected: { status: "matched", method: "lat_lng_100m", locationId: 2383 },
  },
  {
    label: "audit 137 / source listing 233516486 / HBOT UK",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "HBOT UK Ltd",
      website: "http://www.hbot.uk",
      lat: 53.7776944,
      lng: -0.3372681,
      locality: "Doncaster",
      country_code: "GB",
      slug: "hbot-uk-ltd-doncaster",
    },
    candidates: [candidate({
      id: 2348,
      name: "HBOT UK Ltd",
      website: "https://hbot.uk/",
      lat: 53.7777327,
      lng: -0.3367278,
      locality: "North Humberside",
      country_code: "GB",
      slug: "hbot-uk-ltd-north-humberside",
    })],
    expected: { status: "matched", method: "lat_lng_100m", locationId: 2348 },
  },
  {
    label: "audit 146 / source listing 251524911 / RX-O2",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "RX-O2 Hyperbaric Clinic",
      website: "https://rx-o2.com",
      lat: 33.5189438,
      lng: -112.1694562,
      locality: "Phoenix",
      country_code: "US",
      slug: "rx-o2-hyperbaric-clinic-phoenix-2",
    },
    candidates: [candidate({
      id: 11755,
      name: "RX-O2 Hyperbaric Clinic",
      website: "https://rx-o2.com/",
      lat: 33.5189438,
      lng: -112.1694465,
      locality: "Glendale",
      country_code: "US",
      slug: "rx-o2-hyperbaric-clinic-glendale",
    })],
    expected: { status: "matched", method: "lat_lng_100m", locationId: 11755 },
  },
  {
    label: "audit 148 / source listing 252011816 / OxygenWell",
    provenance: HYPERBARIC_AUDIT,
    incoming: {
      name: "OxygenWell Hyperbaric & Regenerative Medicine Center",
      website: "https://oxygenwell.com",
      lat: 34.1707201,
      lng: -118.5399501,
      locality: "Los Angeles",
      country_code: "US",
      slug: "oxygenwell-hyperbaric-regenerative-medicine-center-los-angeles",
    },
    candidates: [candidate({
      id: 1433,
      name: "OxygenWell Hyperbaric & Regenerative Medicine Center",
      website: "https://oxygenwell.com/",
      lat: 34.170703,
      lng: -118.5400721,
      locality: "Tarzana",
      country_code: "US",
      slug: "oxygenwell-hyperbaric-regenerative-medicine-center-tarzana",
    })],
    expected: { status: "matched", method: "lat_lng_100m", locationId: 1433 },
  },
];

const aaltoFixture: HistoricalFixture = {
  label: "Aalto deleted duplicate 8105 -> survivor 1430",
  provenance:
    "fountain_raw.dedup_candidates_20260711 method=slug_suffix keep_id=1430 merge_id=8105 decision=merged confidence=0.95",
  incoming: {
    name: "Aalto Hyperbaric Medical Group",
    website: "https://aaltohyperbaric.com/",
    lat: 34.0593428,
    lng: -118.4112215,
    locality: "Los Angeles",
    country_code: "US",
    slug: "aalto-hyperbaric-medical-group-los-angeles-2",
  },
  candidates: [candidate({
    id: 1430,
    name: "Aalto Hyperbaric Medical Group",
    website: "https://aaltohyperbaric.com/",
    lat: 34.0593428,
    lng: -118.4112215,
    locality: "Los Angeles",
    country_code: "US",
    slug: "aalto-hyperbaric-medical-group-los-angeles",
  })],
  expected: { status: "matched", method: "website_domain_locality", locationId: 1430 },
};

// No persisted name_geo rows survived in the current dedup audit. These are
// reconstructed from current location pairs using the historical rule: fuzzy
// normalized name plus distance >100m and <=150m. They must be review-only.
const nameGeoFixtures: HistoricalFixture[] = [
  {
    label: "reconstructed pair 4523 -> 4527 / The Biostation / 102.01m",
    provenance: "reconstructed from fountain.locations using execute-hyperbaric-dedup-v2.mjs name_geo rule",
    incoming: {
      name: "The Biostation",
      website: "https://thebiostation.com/",
      lat: 25.8071128,
      lng: -80.192451,
      locality: "Street Miami",
      country_code: "US",
      slug: "the-biostation-street-miami",
    },
    candidates: [candidate({
      id: 4527,
      name: "The Biostation",
      website: "https://thebiostation.com/",
      lat: 25.8074857,
      lng: -80.1933821,
      locality: "Miami",
      country_code: "US",
      slug: "the-biostation-miami",
    })],
    expected: { status: "review", method: "name_geo", locationId: 4527 },
  },
  {
    label: "reconstructed pair 7184 -> 7186 / Miami Stem Cell / 146.53m",
    provenance: "reconstructed from fountain.locations using execute-hyperbaric-dedup-v2.mjs name_geo rule",
    incoming: {
      name: "Miami Stem Cell",
      website: "https://stemcellmia.com/",
      lat: 25.7026411,
      lng: -80.2951515,
      locality: "Miami",
      country_code: "US",
      slug: "miami-stem-cell",
    },
    candidates: [candidate({
      id: 7186,
      name: "Miami Stem Cell",
      website: "https://stemcellmia.com/",
      lat: 25.7038897,
      lng: -80.2946838,
      locality: "South Miami",
      country_code: "US",
      slug: "miami-stem-cell-south-miami",
    })],
    expected: { status: "review", method: "name_geo", locationId: 7186 },
  },
  {
    label: "reconstructed pair 1427 -> 3149 / Functional Medicine / 147.78m",
    provenance: "reconstructed from fountain.locations using execute-hyperbaric-dedup-v2.mjs name_geo rule",
    incoming: {
      name: "Functional Medicine Los Angeles",
      website: "http://www.functionalmedicinelosangeles.com/",
      lat: 34.1525222,
      lng: -118.3630313,
      locality: "North Hollywood",
      country_code: "US",
      slug: "functional-medicine-los-angeles-north-hollywood",
    },
    candidates: [candidate({
      id: 3149,
      name: "Functional Medicine Los Angeles",
      website: "http://www.functionalmedicinelosangeles.com/",
      lat: 34.1522225,
      lng: -118.3614667,
      locality: "Toluca Lake",
      country_code: "US",
      slug: "functional-medicine-los-angeles-toluca-lake",
    })],
    expected: { status: "review", method: "name_geo", locationId: 3149 },
  },
];

type NegativeFixture = {
  label: string;
  provenance: string;
  incoming: LocationInput;
  candidates: LocationCandidate[];
};

const bookimedMismatchFixtures: NegativeFixture[] = [
  {
    label: "1878 Patient centered Pain Clinic is not 1739 Medipol Mega",
    provenance: "fountain_raw.bookimed_website_backfill_guardrail_20260708",
    incoming: {
      name: "Patient centered Pain Clinic",
      website: "https://www.medipol.com.tr/",
      lat: 41.0585935,
      lng: 28.842588,
      locality: "Istanbul",
      country_code: "TR",
      slug: "patient-centered-pain-clinic-istanbul",
    },
    candidates: [candidate({
      id: 1739,
      name: "Medipol Mega University Hospital",
      website: "https://www.medipol.com.tr/",
      lat: 41.058443,
      lng: 28.842109,
      locality: "Istanbul",
      country_code: "TR",
      slug: "medipol-mega-university-hospital-istanbul",
    })],
  },
  {
    label: "1816 Evangelische Lunge Clinic is not 1817 Hubertus",
    provenance: "fountain_raw.bookimed_website_backfill_guardrail_20260708",
    incoming: {
      name: "Evangelische Lunge Clinic",
      website: "https://www.johannesstift-diakonie.de/medizinische-versorgung/evangelische-lungenklinik",
      lat: 52.527779,
      lng: 13.468417,
      locality: "Berlin",
      country_code: "DE",
      slug: "evangelische-lunge-clinic-berlin",
    },
    candidates: [candidate({
      id: 1817,
      name: "Ev.Clinic Hubertus",
      website: "https://www.johannesstift-diakonie.de/medizinische-versorgung/evangelisches-krankenhaus-hubertus/",
      lat: 52.431837,
      lng: 13.219454,
      locality: "Berlin",
      country_code: "DE",
      slug: "ev-clinic-hubertus-berlin",
    })],
  },
  {
    label: "1836 B. Care Spa is not 1989 B.Care Medical Center",
    provenance: "fountain_raw.bookimed_website_backfill_guardrail_20260708",
    incoming: {
      name: "B. Care Spa",
      website: "https://bcaremedicalcenter.com/",
      lat: 13.9059716,
      lng: 100.6347995,
      locality: "Khwaeng Sai Mai",
      country_code: "TH",
      slug: "b-care-spa-bangkok",
    },
    candidates: [candidate({
      id: 1989,
      name: "B.Care Medical Center",
      website: "https://bcaremedicalcenter.com/",
      lat: 13.943385,
      lng: 100.624557,
      locality: "Bangkok",
      country_code: "TH",
      slug: "b-care-medical-center-bangkok",
    })],
  },
  {
    label: "1949 DentaCare Garbary is not 1955 Medicover Gdansk",
    provenance: "fountain_raw.bookimed_website_backfill_guardrail_20260708",
    incoming: {
      name: "DentaCare Garbary",
      website: "https://www.medicover.pl/placowki/stomatologia-medicover-poznan-garbary,10174,d,1022",
      lat: 52.4128,
      lng: 16.9392431,
      locality: "Poznan",
      country_code: "PL",
      slug: "dentacare-garbary-poznan",
    },
    candidates: [candidate({
      id: 1955,
      name: "Medicover Gdansk",
      website: "https://www.medicover.pl/placowki/stomatologia-medicover-gdansk-sosnowa,9575,d,1022",
      lat: 54.3773197,
      lng: 18.6009571,
      locality: "Gdansk",
      country_code: "PL",
      slug: "medicover-gdansk",
    })],
  },
];

// The mismatch-approval guardrail itself is empty after the five approvals were
// applied. Its retained action rows are translation/transliteration positives
// that required a human reason. The location matcher must not infer those
// identities automatically from the fields available here.
const bookimedManualApprovalFixtures: NegativeFixture[] = [
  {
    label: "1750 Moodist required a Turkish translation approval",
    provenance: "fountain_raw.bookimed_mismatch_approval_location_actions_20260708 place_id=ChIJpUuecvrHyhQRbJg1ak9TG7g",
    incoming: {
      name: "Özel Moodist Hastanesi",
      website: "http://www.moodisthastanesi.com/",
      lat: null,
      lng: null,
      locality: "Istanbul",
      country_code: "TR",
    },
    candidates: [candidate({
      id: 1750,
      name: "Moodist Psychiatry and Neurology Hospital",
      website: "https://us-uk.bookimed.com/clinic/moodist-psychiatry-and-neurology-hospital/",
      lat: 0,
      lng: 0,
      locality: "Istanbul",
      country_code: "TR",
      slug: "moodist-psychiatry-and-neurology-hospital-istanbul",
    })],
  },
  {
    label: "1788 Expert Hospital required a Ukrainian translation approval",
    provenance: "fountain_raw.bookimed_mismatch_approval_location_actions_20260708 place_id=ChIJj9lYDrLdOkcRSUPBEkJSOPU",
    incoming: {
      name: "Likarnya Ekspert",
      website: "http://experthospital.com.ua/",
      lat: null,
      lng: null,
      locality: "Uzhhorod",
      country_code: "UA",
    },
    candidates: [candidate({
      id: 1788,
      name: "Expert Clinic",
      website: "https://us-uk.bookimed.com/clinic/expert-clinic/",
      lat: 49.84421495034737,
      lng: 24.020243437759394,
      locality: "Uzhhorod",
      country_code: "UA",
      slug: "expert-clinic-uzhhorod",
    })],
  },
  {
    label: "1795 Impuls required a Cyrillic same-name approval",
    provenance: "fountain_raw.bookimed_mismatch_approval_location_actions_20260708 place_id=ChIJVRn6q3PN1EARO0jXw6wXJ18",
    incoming: {
      name: "«ИМПУЛЬС»-медицинский центр неотложной помощи",
      website: "https://impuls24.com.ua/",
      lat: null,
      lng: null,
      locality: "Kyiv",
      country_code: "UA",
    },
    candidates: [candidate({
      id: 1795,
      name: "Impuls Medical Center",
      website: "https://us-uk.bookimed.com/clinic/impuls-medical-center/",
      lat: 50.486416,
      lng: 30.431962,
      locality: "Kyiv",
      country_code: "UA",
      slug: "impuls-medical-center-kyiv",
    })],
  },
  {
    label: "1828 Ukrainian Academy required transliteration approval",
    provenance: "fountain_raw.bookimed_mismatch_approval_location_actions_20260708 place_id=ChIJq6o6i0TO1EARsYcQ9njsu9Y",
    incoming: {
      name: "Ukrayinsʹka Akademiya Plastychnoyi Khirurhiyi",
      website: "https://uaps.in.ua/",
      lat: null,
      lng: null,
      locality: "Kyiv",
      country_code: "UA",
    },
    candidates: [candidate({
      id: 1828,
      name: "Ukrainian Academy of Plastic Surgery",
      website: "https://us-uk.bookimed.com/clinic/ukrainian-academy-of-plastic-surgery/",
      lat: 50.462305,
      lng: 30.494573,
      locality: "Kyiv",
      country_code: "UA",
      slug: "ukrainian-academy-of-plastic-surgery-kyiv",
    })],
  },
  {
    label: "1988 Adam and Eve required Turkish/English name-pair approval",
    provenance: "fountain_raw.bookimed_mismatch_approval_location_actions_20260708 place_id=ChIJmzUYUBu3yhQR2M90llekHLk",
    incoming: {
      name: "Adam & Eve Sac Ekimi",
      website: "https://www.ademhavvaclinic.com/",
      lat: null,
      lng: null,
      locality: "Istanbul",
      country_code: "TR",
    },
    candidates: [candidate({
      id: 1988,
      name: "Adem and Havva Medical Center",
      website: "https://us-uk.bookimed.com/clinic/adameve-medical-center/",
      lat: 41.063876,
      lng: 28.977761,
      locality: "Istanbul",
      country_code: "TR",
      slug: "adem-and-havva-medical-center-istanbul",
    })],
  },
];

describe("matcher normalization primitives", () => {
  test("uses one case-, punctuation-, ampersand-, and diacritic-insensitive name form", () => {
    expect(normalizeName("  Hipermed: Medicina Física, Cámara Hiperbárica  "))
      .toBe("hipermed medicina fisica camara hiperbarica");
    expect(normalizeName("AZ Wound & Hyperbaric Medicine"))
      .toBe("az wound and hyperbaric medicine");
    expect(normalizeName("REBASE")).toBe(normalizeName("Rebase"));
  });

  test("normalizes locality with the same Unicode and whitespace guarantees", () => {
    expect(normalizeLocality(" São   Paulo ")).toBe(normalizeLocality("sao paulo"));
    expect(normalizeLocality("Łódź")).toBe("lodz");
    expect(normalizeName("Søren & Ægir")).toBe("soren and aegir");
    expect(normalizeLocality(null)).toBeFalsy();
  });

  test("extracts registrable domains independently of generic-domain policy", () => {
    expect(normalizeWebsiteDomain("https://www.Example.COM/a/path?q=1")).toBe("example.com");
    expect(normalizeWebsiteDomain("https://care.example.co.uk/a/path")).toBe("example.co.uk");
    expect(normalizeWebsiteDomain("example.test/path")).toBe("example.test");
    expect(normalizeWebsiteDomain("https://example.wixsite.com/clinic")).toBe("wixsite.com");
    expect(normalizeWebsiteDomain("https://alpha.co.id/clinic")).toBe("alpha.co.id");
    expect(normalizeWebsiteDomain("https://beta.co.id/clinic")).toBe("beta.co.id");
    expect(normalizeWebsiteDomain("https://appointments.example.de/book"))
      .toBe("example.de");
    expect(normalizeWebsiteDomain("https://maps.google.de/place/example"))
      .toBe("google.de");
  });

  test("exports the maintained generic-domain families", () => {
    const domains = new Set(Array.from(GENERIC_DOMAINS));
    for (const domain of [
      "facebook.com",
      "instagram.com",
      "linktr.ee",
      "wixsite.com",
      "google.com",
      "bookimed.com",
    ]) {
      expect(domains.has(domain), domain).toBe(true);
    }
  });

  test("does not expose the Google host as the identity behind a SERP redirect wrapper", () => {
    const wrapper =
      "https://www.google.com/url?q=https%3A%2F%2Factual-clinic.example%2F&sa=U";
    expect(normalizeWebsiteDomain(wrapper)).toBe("actual-clinic.example");
    expect(normalizeWebsiteDomain("/url?q=https%3A%2F%2Frelative-target.example%2F"))
      .toBe("relative-target.example");
  });

  test("constructs the canonical base used to detect numeric slug collisions", () => {
    expect(locationSlugBase("Aalto Hyperbaric Medical Group", null, "Los Angeles"))
      .toBe("aalto-hyperbaric-medical-group-los-angeles");
    expect(locationSlugBase("RX-O2 Hyperbaric Clinic", null, "Phoenix"))
      .toBe("rx-o2-hyperbaric-clinic-phoenix");
    expect(locationSlugBase("Route 66 Hyperbarics", null, "Kingman"))
      .toBe("route-66-hyperbarics-kingman");
  });

  test("computes stable geo distance and trigram similarity bounds", () => {
    expect(haversineMeters(34.0593428, -118.4112215, 34.0593428, -118.4112215)).toBe(0);
    expect(haversineMeters(53.7776944, -0.3372681, 53.7777327, -0.3367278))
      .toBeCloseTo(35.76, 0);
    expect(haversineMeters(null, -118, 34, -118)).toBeNull();

    expect(trigramSimilarity("Aalto Hyperbaric", "Aalto Hyperbaric")).toBe(1);
    expect(trigramSimilarity("Aalto Hyperbaric", "Completely Different"))
      .toBeLessThan(0.25);
    expect(trigramSimilarity("", "")).toBe(0);
  });
});

describe("historical promotion matcher regressions", () => {
  test.each(websiteDomainLocalityFixtures)("matches website/locality: $label", (fixture) => {
    expectHistoricalFixture(fixture);
  });

  test.each(nameLocalityCountryFixtures)("matches name/locality/country: $label", (fixture) => {
    expectHistoricalFixture(fixture);
  });

  test.each(latLngFixtures)("matches guarded geo: $label", (fixture) => {
    expectHistoricalFixture(fixture);
  });

  test("matches the Aalto suffix duplicate and retains slug-collision evidence", () => {
    const result = scoreLocationCandidates(aaltoFixture.incoming, aaltoFixture.candidates);

    expect(result).toMatchObject({
      status: "matched",
      location_id: 1430,
      method: "website_domain_locality",
      guardrail: null,
    });
    expect(JSON.stringify(result.evidence)).toContain("slug_collision");
    expectContract(result);
  });
});

describe("review-only and negative guardrails", () => {
  test.each(nameGeoFixtures)("routes name_geo to review: $label", (fixture) => {
    const result = scoreLocationCandidates(fixture.incoming, fixture.candidates);

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: fixture.expected.locationId,
      method: "name_geo",
    });
    expect(result.guardrail).toBeTruthy();
    expectContract(result);
  });

  test.each(bookimedMismatchFixtures)("never auto-matches Bookimed mismatch: $label", (fixture) => {
    const result = scoreLocationCandidates(fixture.incoming, fixture.candidates);

    // Exact review guardrail names are deliberately not frozen: guardrails may
    // become stricter, but these known identity conflicts must never auto-match.
    expect(result.status).not.toBe("matched");
    if (result.status === "review") {
      expect(result.guardrail).toBeTruthy();
    }
    expectContract(result);
  });

  test.each(bookimedManualApprovalFixtures)("requires the retained Bookimed human approval: $label", (fixture) => {
    const result = scoreLocationCandidates(fixture.incoming, fixture.candidates);

    expect(result.status).not.toBe("matched");
    expectContract(result);
  });

  test("returns review when the highest-precedence signal fails identity guardrails", () => {
    const result = scoreLocationCandidates(
      {
        name: "Patient centered Pain Clinic",
        website: "https://www.medipol.com.tr/",
        lat: 41.0585935,
        lng: 28.842588,
        locality: "Istanbul",
        country_code: "TR",
      },
      [candidate({
        id: 1739,
        name: "Medipol Mega University Hospital",
        website: "https://www.medipol.com.tr/",
        lat: 41.058443,
        lng: 28.842109,
        locality: "Istanbul",
        country_code: "TR",
        slug: "medipol-mega-university-hospital-istanbul",
      })],
    );

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: 1739,
      method: "website_domain_locality",
    });
    expect(result.guardrail).toBeTruthy();
  });

  test("does not fall through from a guarded domain candidate to a weaker geo auto-match", () => {
    const result = scoreLocationCandidates(
      {
        name: "Unrelated Pain Practice",
        website: "https://shared-health-system.example/locations/pain",
        lat: 40,
        lng: -73,
        locality: "New York",
        country_code: "US",
      },
      [
        candidate({
          id: 701,
          name: "Different University Hospital",
          website: "https://shared-health-system.example/locations/hospital",
          lat: 40.2,
          lng: -73.2,
          locality: "New York",
          country_code: "US",
          slug: "different-university-hospital-new-york",
        }),
        candidate({
          id: 702,
          name: "Unrelated Pain Practice Annex",
          website: null,
          lat: 40.0001,
          lng: -73.0001,
          locality: "Brooklyn",
          country_code: "US",
          slug: "unrelated-pain-practice-annex-brooklyn",
        }),
      ],
    );

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: 701,
      method: "website_domain_locality",
    });
  });

  test("routes ambiguous same-domain/locality candidates to review", () => {
    const incoming: LocationInput = {
      name: "Northside Health",
      website: "https://northside-health.example/clinic",
      lat: 47.61,
      lng: -122.33,
      locality: "Seattle",
      country_code: "US",
      slug: "northside-health-seattle",
    };
    const candidates = [801, 802].map((id, index) => candidate({
      id,
      name: "Northside Health",
      website: `https://northside-health.example/location-${index + 1}`,
      lat: 47.61 + index * 0.01,
      lng: -122.33 + index * 0.01,
      locality: "Seattle",
      country_code: "US",
      slug: `northside-health-seattle-${index + 2}`,
    }));

    const result = scoreLocationCandidates(incoming, candidates);
    expect(result).toMatchObject({ status: "review", method: "website_domain_locality" });
    expect([801, 802]).toContain(result.candidate_location_id);
    expect(result.guardrail).toBeTruthy();
  });

  test("never uses a generic social profile to establish a domain match", () => {
    const result = scoreLocationCandidates(
      {
        name: "Alpha Oxygen",
        website: "https://facebook.com/alpha-oxygen",
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
      },
      [candidate({
        id: 901,
        name: "Beta Oxygen",
        website: "https://facebook.com/beta-oxygen",
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
        slug: "beta-oxygen-austin",
      })],
    );

    expect(result.status).not.toBe("matched");
  });

  test("does not collapse unrelated sites under an unlisted ccTLD public suffix", () => {
    const result = scoreLocationCandidates(
      {
        name: "Alpha Dental",
        website: "https://alpha.co.id/clinic",
        lat: null,
        lng: null,
        locality: "Jakarta",
        country_code: "ID",
      },
      [candidate({
        id: 905,
        name: "Beta Dental",
        website: "https://beta.co.id/clinic",
        lat: null,
        lng: null,
        locality: "Jakarta",
        country_code: "ID",
        slug: "beta-dental-jakarta",
      })],
    );

    expect(result.status).not.toBe("matched");
  });

  test.each([
    "https://maps.google.de/place/example",
    "https://maps.yandex.ru/example",
    "https://maps.app.goo.gl/example",
  ])("keeps generic map host families unmatchable: %s", (website) => {
    const result = scoreLocationCandidates(
      {
        name: "Alpha Dental",
        website,
        lat: null,
        lng: null,
        locality: "Berlin",
        country_code: "DE",
      },
      [candidate({
        id: 906,
        name: "Beta Dental",
        website,
        lat: null,
        lng: null,
        locality: "Berlin",
        country_code: "DE",
        slug: "beta-dental-berlin",
      })],
    );

    expect(result.status).not.toBe("matched");
  });

  test("unwraps a SERP target but still applies the domain identity guard", () => {
    const result = scoreLocationCandidates(
      {
        name: "Unrelated Search Result",
        website: "https://google.com/url?q=https%3A%2F%2Factual-clinic.example%2F",
        lat: null,
        lng: null,
        locality: "Denver",
        country_code: "US",
      },
      [candidate({
        id: 902,
        name: "Actual Clinic",
        website: "https://actual-clinic.example/",
        lat: null,
        lng: null,
        locality: "Denver",
        country_code: "US",
        slug: "actual-clinic-denver",
      })],
    );

    expect(result.status).not.toBe("matched");
  });

  test("routes an uncorroborated slug collision to review instead of none", () => {
    const result = scoreLocationCandidates(
      {
        name: "Aalto Hyperbaric Medical Group",
        website: null,
        lat: null,
        lng: null,
        locality: "Los Angeles",
        country_code: "CA",
        slug: "aalto-hyperbaric-medical-group-los-angeles-2",
      },
      [candidate({
        id: 1430,
        name: "Aalto Hyperbaric Medical Group",
        website: "https://aaltohyperbaric.com/",
        lat: 34.0593428,
        lng: -118.4112215,
        locality: "Los Angeles",
        country_code: "US",
        slug: "aalto-hyperbaric-medical-group-los-angeles",
      })],
    );

    expect(result).toMatchObject({ status: "review", candidate_location_id: 1430 });
    expect(JSON.stringify(result.evidence)).toContain("slug_collision");
  });

  test("detects an explicit numeric suffix pair even after identity fields changed", () => {
    const result = scoreLocationCandidates(
      {
        name: "Renamed Practice",
        website: null,
        lat: null,
        lng: null,
        locality: "New City",
        country_code: "US",
        slug: "legacy-practice-old-city-2",
      },
      [candidate({
        id: 1440,
        name: "Original Practice",
        website: null,
        lat: null,
        lng: null,
        locality: "Old City",
        country_code: "CA",
        slug: "legacy-practice-old-city",
      })],
    );

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: 1440,
      method: "slug_collision",
      guardrail: "slug_collision_only",
    });
  });

  test("does not reinterpret a trailing brand number as a collision suffix", () => {
    const result = scoreLocationCandidates(
      {
        name: "Clinic 360",
        website: null,
        lat: null,
        lng: null,
        locality: null,
        country_code: "US",
        slug: "clinic-360",
      },
      [candidate({
        id: 1441,
        name: "Clinic",
        website: null,
        lat: null,
        lng: null,
        locality: null,
        country_code: "CA",
        slug: "clinic",
      })],
    );

    expect(result).toEqual({ status: "none" });
  });

  test("does not treat a shared locality word as meaningful geo identity", () => {
    const result = scoreLocationCandidates(
      {
        name: "Miami Recovery",
        website: null,
        lat: 25.77,
        lng: -80.19,
        locality: "Miami",
        country_code: "US",
      },
      [candidate({
        id: 1442,
        name: "Miami Dental",
        website: null,
        lat: 25.7701,
        lng: -80.1901,
        locality: "Miami Beach",
        country_code: "US",
        slug: "miami-dental-miami-beach",
      })],
    );

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: 1442,
      method: "lat_lng_100m",
      guardrail: "insufficient_geo_identity",
    });
  });

  test("keeps the 100m auto and 150m review boundaries inclusive", () => {
    const incoming: LocationInput = {
      name: "Boundary Identity",
      website: null,
      lat: 0,
      lng: 10,
      locality: "Origin",
      country_code: "US",
    };
    const atDistance = (id: number, meters: number) => candidate({
      id,
      name: "Boundary Identity",
      website: null,
      lat: 0,
      lng: 10 + (meters / 6_371_000) * (180 / Math.PI),
      locality: `Destination ${id}`,
      country_code: "US",
      slug: `boundary-identity-destination-${id}`,
    });

    expect(scoreLocationCandidates(incoming, [atDistance(1450, 100)]))
      .toMatchObject({ status: "matched", method: "lat_lng_100m", location_id: 1450 });
    expect(scoreLocationCandidates(incoming, [atDistance(1451, 150)]))
      .toMatchObject({ status: "review", method: "name_geo", candidate_location_id: 1451 });
    expect(scoreLocationCandidates(incoming, [atDistance(1452, 150.01)]))
      .toEqual({ status: "none" });
  });

  test("routes equal-distance qualifying geo candidates to review", () => {
    const incoming: LocationInput = {
      name: "Alpha Recovery",
      website: null,
      lat: 30,
      lng: -97,
      locality: "Austin",
      country_code: "US",
    };
    const candidates = [1460, 1461].map((id) => candidate({
      id,
      name: "Alpha Recovery Annex",
      website: null,
      lat: 30.0001,
      lng: -97.0001,
      locality: `Austin Annex ${id}`,
      country_code: "US",
      slug: `alpha-recovery-annex-${id}`,
    }));

    expect(scoreLocationCandidates(incoming, candidates)).toMatchObject({
      status: "review",
      method: "lat_lng_100m",
      guardrail: "ambiguous_candidates",
    });
  });

  test("keeps null-country name_geo pairs reviewable like IS NOT DISTINCT FROM", () => {
    const distance = 120;
    const result = scoreLocationCandidates(
      {
        name: "Countryless Identity",
        website: null,
        lat: 0,
        lng: 10,
        locality: "Origin",
        country_code: null,
      },
      [candidate({
        id: 1463,
        name: "Countryless Identity",
        website: null,
        lat: 0,
        lng: 10 + (distance / 6_371_000) * (180 / Math.PI),
        locality: "Destination",
        country_code: null,
        slug: "countryless-identity-destination",
      })],
    );

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: 1463,
      method: "name_geo",
      guardrail: "name_geo_review_only",
    });
  });

  test("uses the organization domain only when the location URL is unparseable", () => {
    const incoming: LocationInput = {
      name: "Fallback Identity",
      website: "https://fallback-identity.example/",
      lat: null,
      lng: null,
      locality: "Austin",
      country_code: "US",
    };
    const result = scoreLocationCandidates(incoming, [candidate({
      id: 1443,
      name: "Fallback Identity",
      website: "not a valid URL",
      org_website_domain: "fallback-identity.example",
      lat: null,
      lng: null,
      locality: "Austin",
      country_code: "US",
      slug: "fallback-identity-austin",
    })]);

    expect(result).toMatchObject({
      status: "matched",
      location_id: 1443,
      method: "website_domain_locality",
    });
  });

  test("keeps a parseable generic location URL authoritative over org fallback", () => {
    const result = scoreLocationCandidates(
      {
        name: "Incoming Brand",
        website: "https://real-brand.example/",
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
      },
      [candidate({
        id: 1444,
        name: "Different Brand",
        website: "https://facebook.com/different-brand",
        org_website_domain: "real-brand.example",
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
        slug: "different-brand-austin",
      })],
    );

    expect(result.status).not.toBe("matched");
  });

  test("routes the historically mixed-brand flt.life domain to review", () => {
    const result = scoreLocationCandidates(
      {
        name: "FLT One",
        website: "https://flt.life/one",
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
      },
      [candidate({
        id: 1462,
        name: "FLT One",
        website: "https://flt.life/one",
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
        slug: "flt-one-austin",
      })],
    );

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: 1462,
      method: "website_domain_locality",
      guardrail: "mixed_brand_domain",
    });
  });

  test("treats any two nonempty differing paths as branch risk", () => {
    const result = scoreLocationCandidates(
      {
        name: "Exact Chain Name",
        website: "https://chain.example/locations/a?branch=one",
        lat: 30,
        lng: -97,
        locality: "Austin",
        country_code: "US",
      },
      [candidate({
        id: 1464,
        name: "Exact Chain Name",
        website: "https://chain.example/locations/a?branch=two",
        lat: 30.00001,
        lng: -97.00001,
        locality: "Austin",
        country_code: "US",
        slug: "exact-chain-name-austin",
      })],
    );

    expect(result).toMatchObject({
      status: "review",
      candidate_location_id: 1464,
      method: "website_domain_locality",
      guardrail: "same_domain_locality_branch_risk",
    });
  });
});

describe("precedence, ranking, and result contract", () => {
  test("uses canonical method precedence before candidate confidence", () => {
    const incoming: LocationInput = {
      name: "Alpha Wellness",
      website: "https://alpha-wellness.example/",
      lat: null,
      lng: null,
      locality: "Austin",
      country_code: "US",
    };
    const result = scoreLocationCandidates(incoming, [
      candidate({
        id: 1001,
        name: "Alpha Wellness Center",
        website: "https://www.alpha-wellness.example/services",
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
        slug: "alpha-wellness-center-austin",
      }),
      candidate({
        id: 1002,
        name: "Alpha Wellness",
        website: null,
        lat: null,
        lng: null,
        locality: "Austin",
        country_code: "US",
        slug: "alpha-wellness-austin",
      }),
    ]);

    expect(result).toMatchObject({
      status: "matched",
      location_id: 1001,
      method: "website_domain_locality",
    });
  });

  test("returns none with no match or review signal", () => {
    const result = scoreLocationCandidates(
      {
        name: "One Clinic",
        website: null,
        lat: 10,
        lng: 10,
        locality: "One City",
        country_code: "US",
      },
      [candidate({
        id: 1101,
        name: "Completely Different Hospital",
        website: "https://different.example",
        lat: 20,
        lng: 20,
        locality: "Another City",
        country_code: "CA",
        slug: "completely-different-hospital-another-city",
      })],
    );

    expect(result).toEqual({ status: "none" });
  });

  test("is invariant to candidate input order", () => {
    const incoming: LocationInput = {
      name: "Northside Health",
      website: "https://northside-health.example/",
      lat: 47.61,
      lng: -122.33,
      locality: "Seattle",
      country_code: "US",
    };
    const candidates = [candidate({
      id: 1202,
      name: "Northside Health",
      website: "https://northside-health.example/two",
      lat: 47.611,
      lng: -122.331,
      locality: "Seattle",
      country_code: "US",
      slug: "northside-health-seattle-2",
    }), candidate({
      id: 1201,
      name: "Northside Health",
      website: "https://northside-health.example/one",
      lat: 47.6101,
      lng: -122.3301,
      locality: "Seattle",
      country_code: "US",
      slug: "northside-health-seattle",
    })];

    expect(scoreLocationCandidates(incoming, candidates))
      .toEqual(scoreLocationCandidates(incoming, [...candidates].reverse()));
  });

  test("filters hidden and deleted candidates before scoring", () => {
    const incoming: LocationInput = {
      name: "Inactive Identity",
      website: "https://inactive.example/",
      lat: null,
      lng: null,
      locality: "Austin",
      country_code: "US",
    };
    const base = {
      name: "Inactive Identity",
      website: "https://inactive.example/",
      lat: null,
      lng: null,
      locality: "Austin",
      country_code: "US",
      slug: "inactive-identity-austin",
    };

    expect(scoreLocationCandidates(incoming, [candidate({ id: 1301, status: "hidden", ...base })]))
      .toEqual({ status: "none" });
    expect(scoreLocationCandidates(incoming, [candidate({
      id: 1302,
      deleted_at: "2026-07-11T00:00:00Z",
      ...base,
    })])).toEqual({ status: "none" });
  });

  test("keeps every non-none confidence inside the normalized interval", () => {
    for (const fixture of [
      ...websiteDomainLocalityFixtures,
      ...nameLocalityCountryFixtures,
      ...latLngFixtures,
      ...nameGeoFixtures,
      aaltoFixture,
    ]) {
      expectContract(scoreLocationCandidates(fixture.incoming, fixture.candidates));
    }
  });
});

describe("database-backed matcher adapter", () => {
  test("queries active location candidates, maps DB row shape, and delegates to the scorer", async () => {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      void sql;
      void params;
      return {
        rows: [{
          id: 1430,
          name: "Aalto Hyperbaric Medical Group",
          website: "https://aaltohyperbaric.com/",
          latitude: "34.0593428",
          longitude: "-118.4112215",
          locality: "Los Angeles",
          country_code: "US",
          slug: "aalto-hyperbaric-medical-group-los-angeles",
        }],
        rowCount: 1,
      };
    });

    const result = await matchLocation(aaltoFixture.incoming, { query });

    expect(query).toHaveBeenCalled();
    const [sql, params] = query.mock.calls[0];
    expect(String(sql)).toContain("fountain.locations");
    expect(String(sql)).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(String(sql)).not.toContain("Aalto Hyperbaric Medical Group");
    expect(params).toContain("Aalto Hyperbaric Medical Group");
    expect(params).toContain("aaltohyperbaric.com");
    expect(result).toMatchObject({
      status: "matched",
      location_id: 1430,
      method: "website_domain_locality",
    });
    expectContract(result);
  });

  test("returns the exact none result when the candidate query is empty", async () => {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      void sql;
      void params;
      return { rows: [], rowCount: 0 };
    });

    await expect(matchLocation({
      name: "No Existing Clinic",
      website: null,
      lat: null,
      lng: null,
      locality: null,
      country_code: null,
    }, { query })).resolves.toEqual({ status: "none" });
  });

  test("propagates candidate-query failures", async () => {
    const query = vi.fn(async () => {
      throw new Error("read failed");
    });

    await expect(matchLocation({
      name: "Query Failure Clinic",
      website: null,
      lat: null,
      lng: null,
      locality: "Austin",
      country_code: "US",
    }, { query })).rejects.toThrow("read failed");
  });

  test("passes both computed and explicit numeric slug bases as parameters", async () => {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      void sql;
      void params;
      return { rows: [], rowCount: 0 };
    });

    await matchLocation({
      name: "Renamed Practice",
      website: null,
      lat: null,
      lng: null,
      locality: "New City",
      country_code: "US",
      slug: "legacy-practice-old-city-2",
    }, { query });

    const [, params] = query.mock.calls[0];
    expect(params).toContain("renamed-practice-new-city");
    expect(params).toContain("legacy-practice-old-city");
  });

  test("uses a longitude-wrapping geo predicate across the antimeridian", async () => {
    const query = vi.fn(async (sql: string, params: unknown[] = []) => {
      void params;
      expect(sql).toContain("360.0 - abs");
      return {
        rows: [{
          id: 1501,
          name: "Dateline Recovery",
          website: null,
          latitude: 0,
          longitude: -179.9998,
          locality: "Dateline East",
          country_code: "US",
          slug: "dateline-recovery-dateline-east",
        }],
        rowCount: 1,
      };
    });

    await expect(matchLocation({
      name: "Dateline Recovery",
      website: null,
      lat: 0,
      lng: 179.9998,
      locality: "Dateline West",
      country_code: "US",
    }, { query })).resolves.toMatchObject({
      status: "matched",
      location_id: 1501,
      method: "lat_lng_100m",
    });
  });
});

function expectHistoricalFixture(fixture: HistoricalFixture) {
  const result = scoreLocationCandidates(fixture.incoming, fixture.candidates);
  const idField = fixture.expected.status === "matched"
    ? { location_id: fixture.expected.locationId }
    : { candidate_location_id: fixture.expected.locationId };

  expect(result, `${fixture.label}; ${fixture.provenance}`).toMatchObject({
    status: fixture.expected.status,
    method: fixture.expected.method,
    ...idField,
  });
  expectContract(result);
}

function expectContract(result: Record<string, unknown>) {
  expect(["matched", "review", "none"]).toContain(result.status);

  if (result.status === "none") {
    expect(result).toEqual({ status: "none" });
    return;
  }

  expect(typeof result.confidence).toBe("number");
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(result.evidence).toBeTruthy();

  if (result.status === "matched") {
    expect(typeof result.location_id).toBe("number");
    expect(result.guardrail).toBeNull();
  } else {
    expect(typeof result.candidate_location_id).toBe("number");
    expect(result.guardrail).toBeTruthy();
  }
}
