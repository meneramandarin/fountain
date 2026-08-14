export const treatmentFdaRegulatoryStatuses = [
  "approved_drug",
  "approved_drug_discontinued",
  "cleared_or_approved_device",
  "product_specific",
  "device_specific",
  "no_matching_approved_drug",
  "not_applicable",
  "not_determined",
] as const;

export type TreatmentFdaRegulatoryStatus = (typeof treatmentFdaRegulatoryStatuses)[number];

export const treatmentFdaRegulatoryStatusTones = ["positive", "caution", "neutral"] as const;
export type TreatmentFdaRegulatoryStatusTone = (typeof treatmentFdaRegulatoryStatusTones)[number];

type RegulatoryStatusCopy = {
  heading: string;
  menu: string;
  sourceUrl: string;
  tone: TreatmentFdaRegulatoryStatusTone;
  visible: boolean;
  menuVisible: boolean;
};

export const treatmentFdaRegulatoryStatusCopy: Record<TreatmentFdaRegulatoryStatus, RegulatoryStatusCopy> = {
  approved_drug: {
    heading: "FDA-approved drug products available",
    menu: "FDA-approved drug products exist",
    sourceUrl: "https://www.accessdata.fda.gov/scripts/cder/daf/",
    tone: "positive",
    visible: true,
    menuVisible: true,
  },
  approved_drug_discontinued: {
    heading: "Previously FDA-approved",
    menu: "Historical FDA drug approval",
    sourceUrl: "https://www.accessdata.fda.gov/scripts/cder/daf/",
    tone: "caution",
    visible: true,
    menuVisible: true,
  },
  cleared_or_approved_device: {
    heading: "FDA-cleared or approved device found",
    menu: "FDA-cleared or approved device found",
    sourceUrl: "https://www.fda.gov/medical-devices/device-approvals-denials-and-clearances/510k-clearances",
    tone: "positive",
    visible: true,
    menuVisible: true,
  },
  product_specific: {
    heading: "FDA status depends on the product used",
    menu: "FDA status depends on product used",
    sourceUrl: "https://www.fda.gov/consumers/consumer-updates/it-really-fda-approved",
    tone: "neutral",
    visible: true,
    menuVisible: false,
  },
  device_specific: {
    heading: "FDA status depends on the device used",
    menu: "FDA status depends on device used",
    sourceUrl: "https://www.fda.gov/medical-devices/consumers-medical-devices/are-there-fda-registered-or-fda-certified-medical-devices-how-do-i-know-what-fda-approved",
    tone: "neutral",
    visible: true,
    menuVisible: false,
  },
  no_matching_approved_drug: {
    heading: "No matching FDA-approved drug found",
    menu: "No matching FDA-approved drug found",
    sourceUrl: "https://www.accessdata.fda.gov/scripts/cder/daf/",
    tone: "caution",
    visible: true,
    menuVisible: true,
  },
  not_applicable: {
    heading: "FDA product approval does not apply",
    menu: "FDA product approval not applicable",
    sourceUrl: "https://www.fda.gov/consumers/consumer-updates/it-really-fda-approved",
    tone: "neutral",
    visible: false,
    menuVisible: false,
  },
  not_determined: {
    heading: "FDA status not determined",
    menu: "FDA status not determined",
    sourceUrl: "https://www.fda.gov/consumers/consumer-updates/it-really-fda-approved",
    tone: "neutral",
    visible: false,
    menuVisible: false,
  },
};

export function isTreatmentFdaRegulatoryStatus(value: unknown): value is TreatmentFdaRegulatoryStatus {
  return treatmentFdaRegulatoryStatuses.includes(value as TreatmentFdaRegulatoryStatus);
}

export function visibleTreatmentFdaStatus(status: TreatmentFdaRegulatoryStatus | null | undefined) {
  return status && treatmentFdaRegulatoryStatusCopy[status].visible ? status : null;
}

export function visibleTreatmentFdaMenuStatus(status: TreatmentFdaRegulatoryStatus | null | undefined) {
  return status && treatmentFdaRegulatoryStatusCopy[status].menuVisible ? status : null;
}
