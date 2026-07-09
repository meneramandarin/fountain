export const TRACKING_PARAM_NAMES: Set<string>;
export function isTrackingParamName(name: string, url?: URL): boolean;
export function sanitizeUrl(value: string | null | undefined): string | null;
export function addFountainReferralParams(value: string | null | undefined): string | null;
export function containsTrackingParams(value: string | null | undefined): boolean;
