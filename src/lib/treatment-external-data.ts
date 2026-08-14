const sourceCacheSeconds = 6 * 60 * 60;

type TreatmentSourceConfig = {
  name: string;
  clinicalTrials: {
    parameter: "query.intr" | "query.term";
    query: string;
    sourceUrl: string;
  };
};

export type ClinicalTrialRecord = {
  nctId: string;
  title: string;
  status: string;
  phases: string[];
  enrollment: number | null;
  hasResults: boolean;
  updatedAt: string | null;
};

export type ClinicalTrialsData = {
  total: number;
  recruiting: number;
  withResults: number;
  statusCounts: Record<string, number>;
  records: ClinicalTrialRecord[];
  sourceUrl: string;
  updatedAt: string | null;
};

export type TreatmentExternalData = {
  treatmentName: string;
  clinicalTrials: ClinicalTrialsData | null;
};

export type TreatmentExternalDataByName = Record<string, TreatmentExternalData>;

const configs: TreatmentSourceConfig[] = [
  {
    name: "Sermorelin",
    clinicalTrials: {
      // ClinicalTrials.gov expands this term to related GHRH interventions.
      parameter: "query.intr",
      query: "sermorelin",
      sourceUrl: "https://clinicaltrials.gov/search?intr=sermorelin",
    },
  },
  {
    name: "Rapamycin",
    clinicalTrials: {
      parameter: "query.term",
      query: "AREA[InterventionName]EXPANSION[None](rapamycin OR sirolimus)",
      sourceUrl:
        "https://clinicaltrials.gov/search?term=AREA%5BInterventionName%5DEXPANSION%5BNone%5D%28rapamycin%20OR%20sirolimus%29",
    },
  },
];

const configByNormalizedName = new Map(
  configs.map((config) => [normalizeName(config.name), config]),
);

export function hasTreatmentExternalData(name: string | null | undefined) {
  return Boolean(name && configByNormalizedName.has(normalizeName(name)));
}

export async function getTreatmentExternalData(
  name: string | null | undefined,
): Promise<TreatmentExternalData | null> {
  if (!name) return null;
  const config = configByNormalizedName.get(normalizeName(name));
  if (!config) return null;

  const clinicalTrials = await loadClinicalTrials(config).catch(() => null);

  if (!clinicalTrials) return null;
  return { treatmentName: config.name, clinicalTrials };
}

export async function getTreatmentExternalDataForNames(
  names: Array<string | null | undefined>,
): Promise<TreatmentExternalDataByName> {
  const canonicalNames = [...new Set(
    names.flatMap((name) => {
      if (!name) return [];
      const config = configByNormalizedName.get(normalizeName(name));
      return config ? [config.name] : [];
    }),
  )];
  const records = await Promise.all(canonicalNames.map(getTreatmentExternalData));

  return Object.fromEntries(
    records.flatMap((record) => record ? [[record.treatmentName, record]] : []),
  );
}

async function loadClinicalTrials(config: TreatmentSourceConfig): Promise<ClinicalTrialsData> {
  const studiesUrl = new URL("https://clinicaltrials.gov/api/v2/studies");
  studiesUrl.searchParams.set(config.clinicalTrials.parameter, config.clinicalTrials.query);
  studiesUrl.searchParams.set("pageSize", "1000");
  studiesUrl.searchParams.set("countTotal", "true");
  studiesUrl.searchParams.set("sort", "LastUpdatePostDate:desc");
  studiesUrl.searchParams.set(
    "fields",
    "NCTId,BriefTitle,OverallStatus,HasResults,Phase,EnrollmentCount,LastUpdatePostDate",
  );

  const [response, version] = await Promise.all([
    fetchJson<ClinicalTrialsResponse>(studiesUrl),
    fetchJson<ClinicalTrialsVersion>(new URL("https://clinicaltrials.gov/api/v2/version")),
  ]);
  const studies = response.studies || [];
  const statusCounts: Record<string, number> = {};
  const records = studies.map((study): ClinicalTrialRecord | null => {
    const protocol = study.protocolSection;
    const nctId = protocol?.identificationModule?.nctId;
    const title = protocol?.identificationModule?.briefTitle;
    const status = protocol?.statusModule?.overallStatus;
    if (!nctId || !title || !status) return null;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    return {
      nctId,
      title,
      status,
      phases: protocol.designModule?.phases || [],
      enrollment: finiteNumber(protocol.designModule?.enrollmentInfo?.count),
      hasResults: Boolean(study.hasResults),
      updatedAt: protocol.statusModule?.lastUpdatePostDateStruct?.date || null,
    };
  }).filter((record): record is ClinicalTrialRecord => Boolean(record));

  return {
    total: Number(response.totalCount || records.length),
    recruiting: statusCounts.RECRUITING || 0,
    withResults: records.filter((record) => record.hasResults).length,
    statusCounts,
    records: records.slice(0, 3),
    sourceUrl: config.clinicalTrials.sourceUrl,
    updatedAt: version.dataTimestamp || null,
  };
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: sourceCacheSeconds },
  });
  if (!response.ok) {
    throw new Error(`External treatment data request failed with ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type ClinicalTrialsVersion = { dataTimestamp?: string };
type ClinicalTrialsResponse = {
  totalCount?: number;
  studies?: Array<{
    hasResults?: boolean;
    protocolSection?: {
      identificationModule?: { nctId?: string; briefTitle?: string };
      statusModule?: {
        overallStatus?: string;
        lastUpdatePostDateStruct?: { date?: string };
      };
      designModule?: {
        phases?: string[];
        enrollmentInfo?: { count?: number };
      };
    };
  }>;
};
